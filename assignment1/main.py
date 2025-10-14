from hdfs import InsecureClient
import time

HDFS_URL = "http://hadoop-namenode:9870"  # matches docker-compose
HDFS_DIR = "/user/hadoop/items"

# Wait for HDFS to be ready
client = None
for i in range(20):
    try:
        client = InsecureClient(HDFS_URL, user='hadoop')
        client.status('/')
        print("✅ HDFS is ready!")
        break
    except Exception:
        print(f"⏳ Waiting for HDFS... {i+1}/20")
        time.sleep(5)
else:
    print("❌ HDFS not reachable. Exiting.")
    exit(1)

# Create user folder if not exists
try:
    client.makedirs(HDFS_DIR)
    print(f"✅ Created directory {HDFS_DIR}")
except Exception as e:
    print(f"⚠️ Could not create directory {HDFS_DIR}: {e}")
