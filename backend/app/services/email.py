import asyncio
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import boto3
import httpx

from ..config import settings
from ..db import get_db
from ..encryption import decrypt
from ..serialize import oid


def frontend_base() -> str:
    return str(settings.frontend_url or "https://projectflow.supporticon.com").rstrip("/")


async def company_email(db, company_id):
    row = await db.companysettings.find_one({"company": oid(company_id)})
    return (row or {}).get("email") or {}


def _secret(email, field):
    raw = email.get(field) or ""
    if not raw:
        return ""
    try:
        return decrypt(raw)
    except Exception:
        return ""


def _send_gmail(email, to, subject, text, html):
    user = (email.get("gmailUser") or email.get("fromEmail") or "").strip()
    password = _secret(email, "appPasswordEncrypted")
    if not user or not password:
        raise RuntimeError("Gmail is not configured")
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f'{email.get("fromName") or "Supporticon"} <{email.get("fromEmail") or user}>'
    msg["To"] = to
    msg.attach(MIMEText(text, "plain"))
    if html:
        msg.attach(MIMEText(html, "html"))
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=20) as smtp:
        smtp.login(user, password)
        smtp.sendmail(user, [to], msg.as_string())


def _send_ses(email, to, subject, text, html):
    key = (email.get("sesAccessKeyId") or "").strip()
    secret = _secret(email, "sesSecretAccessKeyEncrypted")
    region = email.get("sesRegion") or settings.aws_region or "ap-south-1"
    source = email.get("fromEmail") or ""
    if not key or not secret or not source:
        raise RuntimeError("AWS SES is not configured")
    client = boto3.client(
        "ses",
        region_name=region,
        aws_access_key_id=key,
        aws_secret_access_key=secret,
    )
    body = {"Text": {"Data": text, "Charset": "UTF-8"}}
    if html:
        body["Html"] = {"Data": html, "Charset": "UTF-8"}
    client.send_email(
        Source=f'{email.get("fromName") or "Supporticon"} <{source}>',
        Destination={"ToAddresses": [to]},
        Message={"Subject": {"Data": subject, "Charset": "UTF-8"}, "Body": body},
    )


def _send_resend(email, to, subject, text, html):
    api_key = _secret(email, "resendApiKeyEncrypted")
    source = email.get("fromEmail") or ""
    if not api_key or not source:
        raise RuntimeError("Resend is not configured")
    payload = {
        "from": f'{email.get("fromName") or "Supporticon"} <{source}>',
        "to": [to],
        "subject": subject,
        "text": text,
    }
    if html:
        payload["html"] = html
    with httpx.Client(timeout=20) as client:
        res = client.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {api_key}"},
            json=payload,
        )
        res.raise_for_status()


def _deliver(email, to, subject, text, html):
    provider = email.get("provider") or "ses"
    if provider == "gmail":
        _send_gmail(email, to, subject, text, html)
    elif provider == "resend":
        _send_resend(email, to, subject, text, html)
    else:
        _send_ses(email, to, subject, text, html)


async def send_mail(company_id, *, to, subject, text, html=None):
    address = str(to or "").strip().lower()
    if not address or "@" not in address:
        return False
    db = get_db()
    email = await company_email(db, company_id)
    if not email.get("enabled"):
        return False
    try:
        await asyncio.to_thread(_deliver, email, address, subject, text, html)
        return True
    except Exception:
        return False


async def send_mail_many(company_id, addresses, *, subject, text, html=None):
    seen = []
    for item in addresses or []:
        addr = str(item or "").strip().lower()
        if addr and addr not in seen:
            seen.append(addr)
    sent = 0
    for addr in seen:
        if await send_mail(company_id, to=addr, subject=subject, text=text, html=html):
            sent += 1
    return sent
