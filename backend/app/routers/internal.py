from datetime import datetime, timezone

from fastapi import APIRouter, Header

from ..config import settings
from ..deps import fail

router = APIRouter(prefix="/api/internal", tags=["internal"])


def require_cron(secret: str | None):
    if not settings.cron_secret or secret != settings.cron_secret:
        fail(401, "Invalid cron secret")


@router.post("/digest")
async def digest(x_cron_secret: str | None = Header(default=None, alias="X-Cron-Secret")):
    require_cron(x_cron_secret)
    return {"checkedAt": datetime.now(timezone.utc).isoformat(), "results": []}


@router.post("/daily-report")
async def daily_report(x_cron_secret: str | None = Header(default=None, alias="X-Cron-Secret")):
    require_cron(x_cron_secret)
    return {"checkedAt": datetime.now(timezone.utc).isoformat(), "daily": [], "weekly": []}
