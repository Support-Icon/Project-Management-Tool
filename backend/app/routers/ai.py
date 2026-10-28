from fastapi import APIRouter, Body, Depends

from ..db import get_db
from ..deps import admin_user, company_id, current_user, fail
from ..encryption import encrypt
from ..serialize import oid
from ..services.agent import run_project_agent
from ..services.llm import PROVIDER_DEFAULTS

router = APIRouter(prefix="/api/ai", tags=["ai"])


def public_ai(settings):
    ai = (settings or {}).get("ai") or {}
    provider = ai.get("provider") or "groq"
    return {
        "enabled": bool(ai.get("enabled")),
        "provider": provider,
        "model": ai.get("model") or PROVIDER_DEFAULTS.get(provider, {}).get("model") or "",
        "temperature": ai.get("temperature", 0.2),
        "hasApiKey": bool(ai.get("apiKeyEncrypted")),
        "providers": [
            {"id": "groq", "label": "Groq", "defaultModel": PROVIDER_DEFAULTS["groq"]["model"]},
            {"id": "openai", "label": "OpenAI", "defaultModel": PROVIDER_DEFAULTS["openai"]["model"]},
            {"id": "gemini", "label": "Gemini", "defaultModel": PROVIDER_DEFAULTS["gemini"]["model"]},
            {"id": "claude", "label": "Claude", "defaultModel": PROVIDER_DEFAULTS["claude"]["model"]},
        ],
    }


@router.get("/settings")
async def get_settings(user=Depends(admin_user)):
    settings = await get_db().companysettings.find_one({"company": company_id(user)})
    return public_ai(settings)


@router.put("/settings")
async def put_settings(body: dict = Body(default={}), user=Depends(admin_user)):
    provider = body.get("provider") or "groq"
    if provider not in PROVIDER_DEFAULTS:
        fail(400, "Invalid AI provider")
    db = get_db()
    existing = await db.companysettings.find_one({"company": company_id(user)})
    encrypted = ((existing or {}).get("ai") or {}).get("apiKeyEncrypted") or ""
    if body.get("apiKey"):
        encrypted = encrypt(str(body["apiKey"]).strip())
    if body.get("enabled") and not encrypted:
        fail(400, "AI API key is required when enabling the assistant.")
    from datetime import datetime, timezone
    await db.companysettings.update_one(
        {"company": company_id(user)},
        {"$set": {
            "ai.enabled": bool(body.get("enabled")),
            "ai.provider": provider,
            "ai.model": body.get("model") or PROVIDER_DEFAULTS[provider]["model"],
            "ai.temperature": float(body.get("temperature") or 0.2),
            "ai.apiKeyEncrypted": encrypted,
            "updatedAt": datetime.now(timezone.utc),
        }},
        upsert=True,
    )
    settings = await db.companysettings.find_one({"company": company_id(user)})
    return public_ai(settings)


@router.delete("/settings")
async def clear_settings(user=Depends(admin_user)):
    from datetime import datetime, timezone
    await get_db().companysettings.update_one(
        {"company": company_id(user)},
        {"$set": {
            "ai.enabled": False,
            "ai.provider": "groq",
            "ai.model": PROVIDER_DEFAULTS["groq"]["model"],
            "ai.temperature": 0.2,
            "ai.apiKeyEncrypted": "",
            "updatedAt": datetime.now(timezone.utc),
        }},
        upsert=True,
    )
    settings = await get_db().companysettings.find_one({"company": company_id(user)})
    return {"message": "AI configuration cleared", **public_ai(settings)}


@router.post("/chat")
async def chat(body: dict = Body(default={}), user=Depends(current_user)):
    message = str(body.get("message") or "").strip()
    if not message:
        fail(400, "Message is required")
    if len(message) > 4000:
        fail(400, "Message is too long")
    history = body.get("history") if isinstance(body.get("history"), list) else []
    try:
        return await run_project_agent(user, message, history)
    except Exception as exc:
        fail(400, str(exc) or "AI chat failed")
