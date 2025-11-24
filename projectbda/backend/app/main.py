import os
import tempfile
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker
from .models import Base, Waste
from hdfs import InsecureClient
import shutil

# Database (SQLite for metadata)
DATABASE_URL = os.getenv('DATABASE_URL', 'sqlite:///./data.db')
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine)
Base.metadata.create_all(bind=engine)

# If the DB already exists, try to add missing columns (simple ALTER TABLE for SQLite)
def ensure_columns():
    inspector = inspect(engine)
    cols = [c['name'] for c in inspector.get_columns('waste')] if 'waste' in inspector.get_table_names() else []
    needed = {
        'name': 'TEXT',
        'custom_id': 'TEXT',
        'quantity': 'INTEGER',
        'status': 'TEXT',
        'upload_status': 'TEXT',
        'local_path': 'TEXT'
    }
    with engine.begin() as conn:
        for col, coltype in needed.items():
            if col not in cols:
                try:
                    conn.execute(text(f'ALTER TABLE waste ADD COLUMN {col} {coltype}'))
                except Exception:
                    # best effort; skip if not supported
                    pass

ensure_columns()

# Local upload cache directory (persist failed uploads until retried)
UPLOAD_DIR = os.getenv('UPLOAD_DIR', '/app/uploads')
os.makedirs(UPLOAD_DIR, exist_ok=True)

# HDFS client (WebHDFS)
HDFS_URL = os.getenv('HDFS_URL', 'http://namenode:50070')
HDFS_USER = os.getenv('HDFS_USER', 'root')
hdfs_client = InsecureClient(HDFS_URL, user=HDFS_USER)

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post('/waste')
async def create_waste(
    latitude: float = Form(...), longitude: float = Form(...),
    description: str = Form(None), file: UploadFile | None = File(None),
    name: str = Form(None), custom_id: str = Form(None), quantity: int = Form(0), status: str = Form('new')
):
    db = SessionLocal()
    waste = Waste(latitude=latitude, longitude=longitude, description=description, name=name, custom_id=custom_id, quantity=quantity, status=status)
    db.add(waste)
    db.commit()
    db.refresh(waste)

    hdfs_error = None
    if file:
        suffix = os.path.splitext(file.filename)[1]
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            shutil.copyfileobj(file.file, tmp)
            tmp_path = tmp.name
        hdfs_path = f"/waste_files/{waste.id}_{file.filename}"
        try:
            # ensure parent dir exists (best-effort)
            try:
                hdfs_client.status('/waste_files')
            except Exception:
                try:
                    hdfs_client.makedirs('/waste_files')
                except Exception:
                    pass

            hdfs_client.upload(hdfs_path, tmp_path, overwrite=True)
            waste.hdfs_path = hdfs_path
            waste.upload_status = 'uploaded'
            db.add(waste)
            db.commit()
        except Exception as e:
            # Do not return HTTP 500 here. Record that upload failed, persist the file locally and return success with a warning.
            hdfs_error = f"HDFS upload failed: {e}"
            try:
                # move tmp to persistent upload dir
                dest_name = f"{waste.id}_{os.path.basename(file.filename)}"
                dest = os.path.join(UPLOAD_DIR, dest_name)
                shutil.move(tmp_path, dest)
                waste.local_path = dest
                waste.upload_status = 'failed'
                db.add(waste)
                db.commit()
            except Exception:
                # best-effort: if moving fails, still store whatever we can
                try:
                    waste.upload_status = 'failed'
                    db.add(waste)
                    db.commit()
                except Exception:
                    pass
        finally:
            try:
                os.remove(tmp_path)
            except Exception:
                pass

    return {
        "id": waste.id,
        "latitude": waste.latitude,
        "longitude": waste.longitude,
        "description": waste.description,
        "hdfs_path": waste.hdfs_path,
        "name": waste.name,
        "custom_id": waste.custom_id,
        "quantity": waste.quantity,
        "status": waste.status,
        "upload_status": waste.upload_status,
        "hdfs_error": hdfs_error,
    }

@app.get('/waste')
def list_waste():
    db = SessionLocal()
    items = db.query(Waste).all()
    return [
        {"id": i.id, "latitude": i.latitude, "longitude": i.longitude, "description": i.description, "hdfs_path": i.hdfs_path, "name": i.name, "custom_id": i.custom_id, "quantity": i.quantity, "status": i.status, "created_at": i.created_at.isoformat()}
        for i in items
    ]

@app.get('/waste/{item_id}')
def get_waste(item_id: int):
    db = SessionLocal()
    item = db.query(Waste).filter(Waste.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail='Not found')
    return {"id": item.id, "latitude": item.latitude, "longitude": item.longitude, "description": item.description, "hdfs_path": item.hdfs_path, "name": item.name, "custom_id": item.custom_id, "quantity": item.quantity, "status": item.status}

@app.put('/waste/{item_id}')
def update_waste(item_id: int, latitude: float = Form(None), longitude: float = Form(None), description: str = Form(None), name: str = Form(None), custom_id: str = Form(None), quantity: int = Form(None), status: str = Form(None)):
    db = SessionLocal()
    item = db.query(Waste).filter(Waste.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail='Not found')
    if latitude is not None:
        item.latitude = latitude
    if longitude is not None:
        item.longitude = longitude
    if description is not None:
        item.description = description
    if name is not None:
        item.name = name
    if custom_id is not None:
        item.custom_id = custom_id
    if quantity is not None:
        item.quantity = quantity
    if status is not None:
        item.status = status
    db.add(item)
    db.commit()
    return {"id": item.id}

@app.delete('/waste/{item_id}')
def delete_waste(item_id: int):
    db = SessionLocal()
    item = db.query(Waste).filter(Waste.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail='Not found')
    if item.hdfs_path:
        try:
            hdfs_client.delete(item.hdfs_path, recursive=False)
        except Exception:
            pass
    if item.local_path:
        try:
            if os.path.exists(item.local_path):
                os.remove(item.local_path)
        except Exception:
            pass
    db.delete(item)
    db.commit()
    return {"deleted": True}


@app.post('/waste/{item_id}/retry')
def retry_upload(item_id: int):
    db = SessionLocal()
    item = db.query(Waste).filter(Waste.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail='Not found')
    if not item.local_path or not os.path.exists(item.local_path):
        return {"success": False, "message": "No local file to retry"}

    # attempt to upload cached file to HDFS
    hdfs_path = f"/waste_files/{item.id}_{os.path.basename(item.local_path)}"
    try:
        hdfs_client.upload(hdfs_path, item.local_path, overwrite=True)
        item.hdfs_path = hdfs_path
        item.upload_status = 'uploaded'
        # remove local cache
        try:
            os.remove(item.local_path)
        except Exception:
            pass
        item.local_path = None
        db.add(item)
        db.commit()
        return {"success": True, "message": "Uploaded to HDFS", "hdfs_path": hdfs_path}
    except Exception as e:
        item.upload_status = 'failed'
        db.add(item)
        db.commit()
        return {"success": False, "message": f"Retry failed: {e}"}


@app.get('/waste/{item_id}/file')
def get_waste_file(item_id: int):
    db = SessionLocal()
    item = db.query(Waste).filter(Waste.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail='Not found')
    # if there's a local cached file (failed upload), stream it directly
    if item.local_path and os.path.exists(item.local_path):
        def local_stream():
            try:
                with open(item.local_path, 'rb') as f:
                    while True:
                        chunk = f.read(8192)
                        if not chunk:
                            break
                        yield chunk
            except Exception as e:
                raise HTTPException(status_code=500, detail=f'Error reading local file: {e}')

        filename = os.path.basename(item.local_path)
        # try to infer media type
        import mimetypes
        mt, _ = mimetypes.guess_type(filename)
        media_type = mt or 'application/octet-stream'
        return StreamingResponse(local_stream(), media_type=media_type, headers={"Content-Disposition": f"attachment; filename=\"{filename}\""})

    if not item.hdfs_path:
        raise HTTPException(status_code=404, detail='No file for this item')

    def stream():
        try:
            with hdfs_client.read(item.hdfs_path) as reader:
                while True:
                    chunk = reader.read(8192)
                    if not chunk:
                        break
                    yield chunk
        except Exception as e:
            raise HTTPException(status_code=500, detail=f'Error reading from HDFS: {e}')

    # attempt to infer filename from path
    filename = os.path.basename(item.hdfs_path)
    return StreamingResponse(stream(), media_type='application/octet-stream', headers={"Content-Disposition": f"attachment; filename=\"{filename}\""})
