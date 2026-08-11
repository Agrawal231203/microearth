FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

ENV SLPK_UPLOAD_DIR=/data/uploads
ENV SLPK_EXTRACT_DIR=/data/extracted
RUN mkdir -p /data/uploads /data/extracted

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
