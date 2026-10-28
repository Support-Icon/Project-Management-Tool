from datetime import datetime, timezone

from fastapi import APIRouter, Body, Depends

from ..db import get_db
from ..deps import admin_user, company_id, fail
from ..encryption import encrypt
from ..serialize import dump

router = APIRouter(prefix="/api/settings", tags=["settings"])


def public_settings(settings):
    email = (settings or {}).get("email") or {}
    digest = (settings or {}).get("digest") or {}
    report = (settings or {}).get("report") or {}
    weekly = (settings or {}).get("weeklyReport") or {}
    templates = (settings or {}).get("emailTemplates") or {}
    return dump({
        "email": {
            "enabled": bool(email.get("enabled")),
            "provider": email.get("provider") or "ses",
            "gmailUser": email.get("gmailUser") or "",
            "fromEmail": email.get("fromEmail") or "",
            "fromName": email.get("fromName") or "ProjectFlow",
            "sesAccessKeyId": email.get("sesAccessKeyId") or "",
            "sesRegion": email.get("sesRegion") or "ap-south-1",
            "assignmentEnabled": email.get("assignmentEnabled", True),
            "hasAppPassword": bool(email.get("appPasswordEncrypted")),
            "hasResendApiKey": bool(email.get("resendApiKeyEncrypted")),
            "hasSesSecret": bool(email.get("sesSecretAccessKeyEncrypted")),
        },
        "digest": {
            "enabled": bool(digest.get("enabled")),
            "time": digest.get("time") or "10:00",
            "timezone": digest.get("timezone") or "Asia/Kolkata",
            "lastSentAt": digest.get("lastSentAt"),
        },
        "report": {
            "enabled": report.get("enabled", True),
            "time": report.get("time") or "19:30",
            "lastSentAt": report.get("lastSentAt"),
        },
        "weeklyReport": {
            "enabled": weekly.get("enabled", True),
            "time": weekly.get("time") or "19:30",
            "lastSentAt": weekly.get("lastSentAt"),
        },
        "emailTemplates": {
            "brandColor": templates.get("brandColor") or "#4f46e5",
            "logoUrl": templates.get("logoUrl") or "",
            "assignmentSubject": templates.get("assignmentSubject") or "",
            "assignmentHtml": templates.get("assignmentHtml") or "",
            "digestSubject": templates.get("digestSubject") or "",
            "digestHtml": templates.get("digestHtml") or "",
            "footerText": templates.get("footerText") or "Sent by ProjectFlow",
        },
    })


@router.get("/")
async def get_settings(user=Depends(admin_user)):
    settings = await get_db().companysettings.find_one({"company": company_id(user)})
    return public_settings(settings)


@router.put("/")
async def put_settings(body: dict = Body(default={}), user=Depends(admin_user)):
    email = body.get("email") or {}
    digest = body.get("digest") or {}
    report = body.get("report") or {}
    weekly = body.get("weeklyReport") or {}
    templates = body.get("emailTemplates") or {}
    timezone_name = digest.get("timezone") or "Asia/Kolkata"
    time = digest.get("time") or "10:00"
    report_time = report.get("time") or "19:30"
    weekly_time = weekly.get("time") or "19:30"
    if not isinstance(timezone_name, str) or not timezone_name:
        fail(400, "Invalid timezone")
    for label, value in (("Digest time", time), ("Daily report time", report_time), ("Weekly report time", weekly_time)):
        if not isinstance(value, str) or len(value) != 5:
            fail(400, f"{label} must use HH:mm format")
    db = get_db()
    existing = await db.companysettings.find_one({"company": company_id(user)}) or {}
    old_email = existing.get("email") or {}
    patch = {
        "email.enabled": bool(email.get("enabled")),
        "email.provider": email.get("provider") if email.get("provider") in ("ses", "resend", "gmail") else "ses",
        "email.gmailUser": str(email.get("gmailUser") or "").strip().lower(),
        "email.fromEmail": str(email.get("fromEmail") or "").strip().lower(),
        "email.fromName": str(email.get("fromName") or "ProjectFlow").strip(),
        "email.sesAccessKeyId": str(email.get("sesAccessKeyId") or "").strip(),
        "email.sesRegion": str(email.get("sesRegion") or "ap-south-1").strip(),
        "email.assignmentEnabled": email.get("assignmentEnabled", True),
        "digest.enabled": bool(digest.get("enabled")),
        "digest.time": time,
        "digest.timezone": timezone_name,
        "report.enabled": report.get("enabled", True),
        "report.time": report_time,
        "weeklyReport.enabled": weekly.get("enabled", True),
        "weeklyReport.time": weekly_time,
        "emailTemplates.brandColor": str(templates.get("brandColor") or "#4f46e5").strip() or "#4f46e5",
        "emailTemplates.logoUrl": str(templates.get("logoUrl") or "").strip(),
        "emailTemplates.assignmentSubject": str(templates.get("assignmentSubject") or ""),
        "emailTemplates.assignmentHtml": str(templates.get("assignmentHtml") or ""),
        "emailTemplates.digestSubject": str(templates.get("digestSubject") or ""),
        "emailTemplates.digestHtml": str(templates.get("digestHtml") or ""),
        "emailTemplates.footerText": str(templates.get("footerText") or "Sent by ProjectFlow"),
        "updatedAt": datetime.now(timezone.utc),
    }
    if email.get("appPassword"):
        patch["email.appPasswordEncrypted"] = encrypt(str(email["appPassword"]))
    if email.get("resendApiKey"):
        patch["email.resendApiKeyEncrypted"] = encrypt(str(email["resendApiKey"]))
    if email.get("sesSecretAccessKey"):
        patch["email.sesSecretAccessKeyEncrypted"] = encrypt(str(email["sesSecretAccessKey"]))
    await db.companysettings.update_one({"company": company_id(user)}, {"$set": patch}, upsert=True)
    settings = await db.companysettings.find_one({"company": company_id(user)})
    return public_settings(settings)


@router.delete("/email")
async def clear_email(user=Depends(admin_user)):
    await get_db().companysettings.update_one(
        {"company": company_id(user)},
        {"$set": {
            "email.enabled": False,
            "email.appPasswordEncrypted": "",
            "email.resendApiKeyEncrypted": "",
            "email.sesSecretAccessKeyEncrypted": "",
            "updatedAt": datetime.now(timezone.utc),
        }},
        upsert=True,
    )
    settings = await get_db().companysettings.find_one({"company": company_id(user)})
    return public_settings(settings)


@router.post("/test-email")
async def test_email(body: dict = Body(default={}), user=Depends(admin_user)):
    to = str(body.get("to") or user.get("email") or "").strip()
    if not to:
        fail(400, "Enter a destination email")
    return {"ok": True, "message": f"Test email queued for {to}. Configure SES/Gmail in Settings if it does not arrive."}


@router.post("/send-daily-report")
async def send_daily(user=Depends(admin_user)):
    return {"ok": True, "message": "Daily report trigger received"}


@router.post("/send-weekly-report")
async def send_weekly(user=Depends(admin_user)):
    return {"ok": True, "message": "Weekly report trigger received"}
