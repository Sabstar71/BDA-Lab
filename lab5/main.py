from fastapi import FastAPI, HTTPException
from pyspark.sql import SparkSession, Row
import os
import pandas as pd
from datetime import datetime

app = FastAPI()

# Initialize a single persistent Spark session at startup
def init_spark():
    SPARK_MASTER = os.getenv("SPARK_MASTER", "spark://pyspark-master:7077")
    SPARK_FS = os.getenv("SPARK_FS", "hdfs://namenode:9000")
    
    spark = (
        SparkSession.builder
        .appName("FastAPI_Spark")
        .master(SPARK_MASTER)
        .config("spark.hadoop.fs.defaultFS", SPARK_FS)
        .config("spark.sql.shuffle.partitions", "1")
        .getOrCreate()
    )
    spark.sparkContext.setLogLevel("WARN")
    return spark

try:
    spark = init_spark()
except Exception as e:
    print(f"Failed to initialize Spark: {e}")
    spark = None


@app.get("/")
def root():
    return {"message": "FastAPI is running with Spark + Hadoop"}


@app.get("/hello")
def hello_world():
    return {"message": "Hello World from FastAPI + Spark + Hadoop!"}

def read_or_create_df(spark: SparkSession, hdfs_path: str):
    """Read parquet from HDFS or create an empty dataframe with schema."""
    try:
        df = spark.read.parquet(hdfs_path)
        if df.count() > 0:
            return df
    except Exception as e:
        print(f"Parquet file not found at {hdfs_path}: {e}")
    
    # Return empty dataframe with correct schema
    return spark.createDataFrame([], "name STRING, age INT, timestamp STRING")


@app.post("/message")
def post_message(data: dict):
    """Post a message."""
    if not spark:
        raise HTTPException(status_code=500, detail="Spark is not initialized")
    
    message = data.get("message", "")
    
    HDFS_PATH = os.getenv("HDFS_PATH", "/user/root/messages.parquet")
    
    try:
        # Create a single-row dataframe with the message and timestamp
        record = {
            "name": "message",
            "age": 1,
            "timestamp": datetime.utcnow().isoformat()
        }
        message_df = spark.createDataFrame([record])
        
        # Append to HDFS
        message_df.write.mode("append").parquet(HDFS_PATH)
        return {"status": "ok", "message": message}
    except Exception as e:
        print(f"Error writing message: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to write message: {str(e)}")


@app.get("/message")
def get_message():
    """Get the latest message."""
    if not spark:
        raise HTTPException(status_code=500, detail="Spark is not initialized")
    
    HDFS_PATH = os.getenv("HDFS_PATH", "/user/root/messages.parquet")
    
    try:
        df = read_or_create_df(spark, HDFS_PATH)
        
        if df.count() == 0:
            return {"message": None, "timestamp": None}
        
        # Get the latest by timestamp
        latest = df.orderBy("timestamp").tail(1)
        if latest:
            row = latest[0].asDict()
            return {"message": row.get("name"), "timestamp": row.get("timestamp")}
        
        return {"message": None, "timestamp": None}
    except Exception as e:
        print(f"Error reading message: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to read message: {str(e)}")