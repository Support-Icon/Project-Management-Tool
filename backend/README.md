# ProjectFlow API (FastAPI)

Python FastAPI backend. Same MongoDB collections and `/api/...` routes as the old Node app, so the React frontend does not change.

## Local run

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 5000
```

Open `http://localhost:5000/` — it should print `hello`.

## Deploy

GitHub Actions `.github/workflows/deploy-backend.yml` still builds a Docker image and updates the existing AWS Lambda (`projectflow-backend`). Secrets stay the same: `MONGODB_URI`, `JWT_SECRET`, `ENCRYPTION_KEY`, `CRON_SECRET`, `FRONTEND_URL`.
