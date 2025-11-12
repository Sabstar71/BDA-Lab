FROM apache/spark:3.5.2-bin-hadoop3

WORKDIR /workspace

COPY app.py .
COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

ENV SPARK_HOME=/opt/spark
ENV PATH=$SPARK_HOME/bin:$PATH

CMD ["spark-submit", "app.py"]
