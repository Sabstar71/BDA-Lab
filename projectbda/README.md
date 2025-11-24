Project BDA - Waste Collection (FastAPI + HDFS + Docker Compose + Map)

Overview
- FastAPI backend exposing CRUD endpoints for waste-location records.
- Store uploaded large files on HDFS and metadata in SQLite (within service container).
- Frontend: simple Leaflet map showing markers for waste locations and a form to add points.
- Docker Compose to run the FastAPI service + Hadoop Namenode/Datanode + static frontend.

Quick start
1. Build and start services:

```powershell
docker-compose up --build
```

2. Backend API: http://localhost:8000
3. Frontend (map): http://localhost:8080

Notes
- HDFS in this compose uses community Hadoop images; if your environment differs you may need to adjust `docker-compose.yml`.
- The backend expects WebHDFS at `http://namenode:9870` by default. You can override with `HDFS_URL` env var.
