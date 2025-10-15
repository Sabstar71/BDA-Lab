import pandas as pd
from hdfs import InsecureClient
import os
import time
import io


HDFS_URL = "http://localhost:9870"

USER = "root"
client = InsecureClient(HDFS_URL, user=USER)

print(f"🔗 Connecting to HDFS at {HDFS_URL}...")


for i in range(20):
    try:
        client.status("/")
        print("✅ HDFS is ready!")
        break
    except Exception as e:
        print(f"⏳ Waiting for HDFS ({i+1}/20): {e}")
        time.sleep(5)
else:
    raise RuntimeError("❌ HDFS not reachable.")

df = pd.DataFrame({
    'Name': ['g', 'a', 'c', 'f'],
    'Age': [20, 14, 25, 12]
})
print("\n🧮 DataFrame created:")
print(df)


os.makedirs('sdfs', exist_ok=True)
df.to_parquet('data.parquet', index=False)
df.to_parquet('sdfs/data.parquet', index=False)
print("📦 Saved parquet locally.")

# --- Upload to HDFS ---
client.makedirs("/data", exist_ok=True)

buf = io.BytesIO()
df.to_parquet(buf, index=False)
buf.seek(0)
with client.write('/data/data.parquet', overwrite=True) as writer:
    writer.write(buf.read())

print("📤 Uploaded data.parquet to HDFS (/data/data.parquet).")

# --- Read back from HDFS ---
print("\n🌐 Reading parquet back from HDFS:")
with client.read('/data/data.parquet') as reader:
    df_hdfs = pd.read_parquet(reader)
print(df_hdfs)

print("\n✅ HDFS <-> Parquet test completed successfully!")
