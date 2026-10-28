# Lambda container image for the FastAPI backend.
# The Web Adapter binary is copied in by CI (scripts/fetch_lambda_adapter.sh).
FROM --platform=linux/amd64 python:3.12-slim-bookworm

COPY .docker-cache/lambda-adapter /opt/extensions/lambda-adapter
RUN chmod 755 /opt/extensions/lambda-adapter

WORKDIR /var/task

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app

ENV PYTHONUNBUFFERED=1
ENV PORT=8080
ENV AWS_LWA_PORT=8080
ENV AWS_LWA_READINESS_CHECK_PATH=/
ENV AWS_LWA_ASYNC_INIT=true

EXPOSE 8080
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--loop", "asyncio", "--http", "h11"]
