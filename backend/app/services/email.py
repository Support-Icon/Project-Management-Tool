import asyncio
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from html import escape

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


def _on_brand_text(color: str) -> str:
    raw = str(color or "").lstrip("#")
    if len(raw) != 6:
        return "#ffffff"
    try:
        r, g, b = int(raw[0:2], 16), int(raw[2:4], 16), int(raw[4:6], 16)
    except ValueError:
        return "#ffffff"
    return "#0B0B0D" if (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 else "#ffffff"


async def company_brand(db, company_id) -> dict:
    settings = await db.companysettings.find_one({"company": oid(company_id)}) or {}
    templates = settings.get("emailTemplates") or {}
    company = await db.companies.find_one({"_id": oid(company_id)}, {"name": 1})
    color = str(templates.get("brandColor") or "#0B0B0D").strip() or "#0B0B0D"
    logo = str(templates.get("logoUrl") or "").strip() or f"{frontend_base()}/supporticon-logo.png"
    return {
        "color": color,
        "ink": _on_brand_text(color),
        "logo": logo,
        "footer": templates.get("footerText") or "Sent by Supporticon",
        "name": (company or {}).get("name") or ((settings.get("email") or {}).get("fromName")) or "Supporticon",
    }


def wrap_branded(brand, inner_html: str) -> str:
    color = escape(brand.get("color") or "#0B0B0D")
    ink = escape(brand.get("ink") or "#ffffff")
    name = escape(brand.get("name") or "Supporticon")
    footer = escape(brand.get("footer") or "Sent by Supporticon")
    logo = str(brand.get("logo") or "").strip()
    logo_html = (
        f'<img src="{escape(logo)}" alt="{name}" width="180" style="max-height:48px;max-width:220px;height:auto;display:block;margin:0 auto;border:0;" />'
        if logo else f'<div style="font-size:20px;font-weight:700;color:{ink}">{name}</div>'
    )
    return f"""
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef3f0;padding:24px 12px;font-family:Arial,Helvetica,sans-serif">
  <tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden">
      <tr><td style="background:{color};padding:22px 24px;text-align:center">{logo_html}</td></tr>
      <tr><td style="padding:28px 24px;color:#0B0B0D;font-size:15px;line-height:1.5">{inner_html}</td></tr>
      <tr><td style="padding:14px 24px;background:#f8faf9;color:#64748b;font-size:12px;text-align:center">{footer}<br/>{name}</td></tr>
    </table>
  </td></tr>
</table>
""".strip()


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
