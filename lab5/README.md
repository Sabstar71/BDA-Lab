
docker-compose up -d

Invoke-RestMethod -Method Get -Uri http://localhost:8000/


Expected output:
```json
{
    "message": "FastAPI is running with Spark + Hadoop"
}
```

Invoke-RestMethod -Method Post -Uri http://localhost:8000/message `
  -ContentType 'application/json' `
  -Body '{"message":"Hello from HDFS PySpark!"}'
```

Expected output:
```json
{
    "status": "ok",
    "message": "Hello from HDFS PySpark!"
}
```

Invoke-RestMethod -Method Get -Uri http://localhost:8000/message
```

Expected output:
```json
{
    "message": "message",
    "timestamp": "2025-12-04T16:31:47.353928"
}
```

Invoke-RestMethod -Method Get -Uri http://localhost:8000/hello
```

Expected output:
```json
{
    "message": "Hello World from FastAPI + Spark + Hadoop!"
}
```

## 🏗 Architecture

```
┌─────────────────────────────────────────┐
│      FastAPI Application (Port 8000)    │
│  - POST /message - add a message        │
│  - GET /message  - retrieve latest      │
│  - GET /        - root message          │
│  - GET /hello   - hello message         │
└──────────────────┬──────────────────────┘
                   │
          ┌────────▼────────┐
          │    PySpark      │
          │   Cluster       │
          ├─────────────────┤
          │ Master:7077     │
          │ Worker:8081     │
          └────────┬────────┘
                   │
        ┌──────────▼──────────┐
        │       HDFS          │
        ├─────────────────────┤
        │ Namenode:9000,9870  │
        │ Datanode:9864       │
        └─────────────────────┘
              (Storage)
```


- `SPARK_MASTER`: Spark master URL (default: `spark://pyspark-master:7077`)
- `SPARK_FS`: HDFS filesystem URL (default: `hdfs://namenode:9000`)
- `HDFS_PATH`: Path to store messages in HDFS (default: `/user/root/messages.parquet`)
- `HDFS_HOST`: HDFS namenode HTTP address (default: `http://namenode:9870`)

#

- **Spark Master UI**: http://localhost:8080
- **Spark Worker UI**: http://localhost:8081
- **HDFS Namenode UI**: http://localhost:9870

