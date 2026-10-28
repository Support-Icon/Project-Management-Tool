from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse

from .config import allowed_origins
from .db import close, connect
from .routers import (
    ai, analytics, attendance, auth, internal, leaves, meetings, messages,
    notifications, projects, reports, settings, task_updates, tasks, users,
)

app = FastAPI(title="ProjectFlow API", version="2.0.0")

origins = allowed_origins()
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or ["*"],
    allow_origin_regex=None if origins else r"https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(HTTPException)
async def http_error(_request: Request, exc: HTTPException):
    detail = exc.detail
    if isinstance(detail, dict):
        return JSONResponse(status_code=exc.status_code, content=detail)
    return JSONResponse(status_code=exc.status_code, content={"message": str(detail)})


@app.on_event("startup")
async def startup():
    await connect()


@app.on_event("shutdown")
async def shutdown():
    await close()


@app.get("/")
async def root():
    return PlainTextResponse("hello")


@app.get("/health")
async def health():
    from datetime import datetime, timezone
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}


app.include_router(auth.router)
app.include_router(users.router)
app.include_router(projects.router)
app.include_router(tasks.router)
app.include_router(task_updates.router)
app.include_router(reports.router)
app.include_router(settings.router)
app.include_router(analytics.router)
app.include_router(ai.router)
app.include_router(notifications.router)
app.include_router(messages.router)
app.include_router(attendance.router)
app.include_router(leaves.router)
app.include_router(meetings.router)
app.include_router(internal.router)
