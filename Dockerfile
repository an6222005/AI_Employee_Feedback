FROM python:3.13-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py db_config.py test_db_config.py ./
COPY utils/ ./utils/
COPY templates/ ./templates/
COPY static/ ./static/
COPY deployment/ ./deployment/
RUN useradd --create-home appuser && chown -R appuser:appuser /app
USER appuser
CMD ["sh", "-c", "python -m deployment.bootstrap && exec gunicorn app:app --bind 0.0.0.0:${PORT:-8080} --workers 1 --threads 4 --timeout 180 --access-logfile - --error-logfile -"]
