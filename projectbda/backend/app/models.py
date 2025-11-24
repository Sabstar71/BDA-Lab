from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy import Column, Integer, Float, String, DateTime
from sqlalchemy import Boolean
import datetime

Base = declarative_base()

class Waste(Base):
    __tablename__ = 'waste'
    id = Column(Integer, primary_key=True, index=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    description = Column(String, nullable=True)
    hdfs_path = Column(String, nullable=True)
    upload_status = Column(String, nullable=True, default='pending')
    local_path = Column(String, nullable=True)
    name = Column(String, nullable=True)
    custom_id = Column(String, nullable=True)
    quantity = Column(Integer, nullable=True, default=0)
    status = Column(String, nullable=True, default='new')
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
