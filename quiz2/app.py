from pyspark.sql import SparkSession

spark = (
    SparkSession.builder
    .appName("HDFS Parquet SQL Student Grades")
    .master("spark://spark-master:7077")
    .config("spark.hadoop.fs.defaultFS", "hdfs://hdfs-nn:9000")
    .getOrCreate()
)
print("Spark session started.")

records = [
    {"student_id": 201, "student_name": "Ali", "age": 20, "subject": "Math", "grade": 85},
    {"student_id": 202, "student_name": "Sara", "age": 22, "subject": "Science", "grade": 78},
    {"student_id": 203, "student_name": "Hassan", "age": 21, "subject": "History", "grade": 92},
    {"student_id": 204, "student_name": "Ayesha", "age": 19, "subject": "Math", "grade": 88},
    {"student_id": 205, "student_name": "Bilal", "age": 20, "subject": "Science", "grade": 81}
]

students_df = spark.createDataFrame(records)
print("Student data created.")
students_df.show()

parquet_path = "hdfs://hdfs-nn:9000/user/data/students_parquet"
print(f"Saving data to {parquet_path}")
students_df.write.mode("overwrite").parquet(parquet_path)
print("Data saved successfully.")

print(f"Reading data from {parquet_path}")
loaded_students_df = spark.read.parquet(parquet_path)

loaded_students_df.createOrReplaceTempView("students")
print("Table 'students' ready for queries.")

print("\nAll students:")
spark.sql("SELECT * FROM students").show()

print("\nStudents studying Science:")
spark.sql("SELECT student_name, grade FROM students WHERE subject = 'Science'").show()

print("\nAverage grade for each subject:")
spark.sql("SELECT subject, AVG(grade) AS avg_grade FROM students GROUP BY subject").show()

print("\nStudents with grade above 85:")
spark.sql("SELECT student_name, subject, grade FROM students WHERE grade > 85").show()

spark.stop()
print("Spark session ended.")