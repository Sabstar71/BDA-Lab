BDA Waste Collection - Real-time project

This repository contains a simple real-time waste collection project for a Big Data assignment.

Components
- HDFS single-node: `sequenceiq/hadoop-docker:2.7.0` (exposes WebHDFS on port 50070)
- Backend: Node.js Express server (CRUD + WebSocket) that persists data to HDFS via WebHDFS
- Frontend: Static HTML + Leaflet map served by Nginx

How to run
1. Ensure Docker Desktop is running on your machine.
2. From the project root run:

```powershell
docker compose up --build
```

3. Open the frontend at http://localhost:3000
4. The backend API is available at http://localhost:8080/api

Notes
- The backend writes a JSON file at `/locations/locations.json` in HDFS using the WebHDFS API. If the Hadoop image takes a while to start, the backend may fail until HDFS is ready; Docker Compose `depends_on` helps but does not wait for HDFS to be fully initialized.
- This implementation uses WebHDFS redirect flow. If your Hadoop image uses different ports, adjust `HDFS_HOST` in `docker-compose.yml` or in backend environment.
