import re
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Body, Depends, Query
from pymongo import ReturnDocument

from ..db import get_db
from ..deps import company_id, current_user, current_user_or_guest, fail
from ..duration import format_ist
from ..roles import can_see_all
from ..security import make_token
from ..serialize import dump, oid
from ..services.email import company_brand, frontend_base, send_mail_many, wrap_branded
from ..services.llm import LANGUAGE_NAMES, invoke_text
from ..services.notify import notify_meeting_invite

router = APIRouter(prefix="/api/meetings", tags=["meetings"])
LIVE_WINDOW_MS = 20000


def live_participants(meeting):
    cutoff = datetime.now(timezone.utc).timestamp() * 1000 - LIVE_WINDOW_MS
    out = []
    for p in meeting.get("participants") or []:
        if p.get("leftAt"):
            continue
        seen = p.get("lastSeen")
        if not seen:
            continue
        ts = seen.timestamp() * 1000 if hasattr(seen, "timestamp") else 0
        if ts >= cutoff:
            out.append(p)
    return out


def recent_reactions(meeting):
    cutoff = datetime.now(timezone.utc).timestamp() * 1000 - 8000
    rows = []
    for r in meeting.get("reactions") or []:
        at = r.get("at")
        ts = at.timestamp() * 1000 if hasattr(at, "timestamp") else 0
        if ts >= cutoff:
            rows.append(r)
    return rows[-12:]


def recent_captions(meeting):
    cutoff = datetime.now(timezone.utc).timestamp() * 1000 - 25000
    rows = []
    for c in meeting.get("captions") or []:
        at = c.get("at")
        ts = at.timestamp() * 1000 if hasattr(at, "timestamp") else 0
        if ts >= cutoff:
            rows.append(c)
    return rows[-6:]


def clean_summary(text: str) -> str:
    value = str(text or "")
    value = re.sub(r"\*\*(.*?)\*\*", r"\1", value)
    value = re.sub(r"__(.*?)__", r"\1", value)
    value = re.sub(r"\*(.*?)\*", r"\1", value)
    value = re.sub(r"^#{1,6}\s*", "", value, flags=re.M)
    value = re.sub(r"`{1,3}", "", value)
    value = re.sub(r"^\s*[-*]\s+", "• ", value, flags=re.M)
    return value.strip()


def summaries_object(meeting):
    raw = meeting.get("summaries") or {}
    if isinstance(raw, dict):
        return raw
    return {}


def public_meeting(meeting, include_guest=False):
    obj = dump(dict(meeting))
    live = []
    for p in live_participants(meeting):
        live.append(dump({
            "user": p.get("user"),
            "username": p.get("username"),
            "avatar": p.get("avatar") or "",
            "isGuest": bool(p.get("isGuest")),
            "handRaised": bool(p.get("handRaised")),
            "isSharing": bool(p.get("isSharing")),
            "lastSeen": p.get("lastSeen"),
        }))
    obj["summary"] = clean_summary(meeting.get("summary") or "")
    obj["summaries"] = summaries_object(meeting)
    obj["liveParticipants"] = live
    obj["captions"] = dump(recent_captions(meeting))
    obj["reactions"] = dump(recent_reactions(meeting))
    obj["notesCount"] = len(meeting.get("notes") or [])
    if not include_guest:
        obj.pop("guestToken", None)
    return obj


EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def clean_emails(values):
    out = []
    for item in values or []:
        addr = str(item or "").strip().lower()
        if addr and EMAIL_RE.match(addr) and addr not in out:
            out.append(addr)
    return out


def parse_when(value):
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def meeting_join_urls(meeting):
    base = frontend_base()
    token = meeting.get("guestToken") or ""
    return {
        "app": f"{base}/meet/{meeting.get('_id')}",
        "guest": f"{base}/join/{token}" if token else "",
    }


async def send_meeting_emails(db, *, company, meeting, host, invitee_ids, extra_emails):
    from html import escape
    people = []
    ids = [oid(i) for i in (invitee_ids or []) if oid(i)]
    if ids:
        people = await db.users.find({"_id": {"$in": ids}, "company": company}, {"email": 1, "username": 1}).to_list(200)
    host_doc = host or {}
    if not host_doc.get("email") and host_doc.get("_id"):
        found = await db.users.find_one({"_id": host_doc["_id"]}, {"email": 1, "username": 1})
        if found:
            host_doc = {**host_doc, **found}
    host_email = str(host_doc.get("email") or "").strip().lower()
    host_name = host_doc.get("username") or "A teammate"
    addresses = clean_emails([p.get("email") for p in people] + list(extra_emails or []) + [host_email])
    if not addresses:
        return 0
    urls = meeting_join_urls(meeting)
    when = format_ist(meeting.get("scheduledAt")) if meeting.get("scheduledAt") else "starting now"
    title = meeting.get("title") or "Team meeting"
    brand = await company_brand(db, company)
    color = brand.get("color") or "#0B0B0D"
    ink = brand.get("ink") or "#ffffff"
    subject = f"Meeting invite: {title}"
    text = (
        f"{host_name} created a meeting: {title}\n\n"
        f"Created by: {host_name}" + (f" ({host_email})" if host_email else "") + "\n"
        f"When: {when}\n"
        f"Join: {urls['app']}\n"
        f"Guest link: {urls['guest']}\n"
    )
    inner = (
        f"<p style='margin:0 0 8px;font-size:13px;letter-spacing:.04em;text-transform:uppercase;color:{escape(color)}'>Meeting invite</p>"
        f"<h1 style='margin:0 0 16px;font-size:22px;line-height:1.3'>{escape(title)}</h1>"
        f"<p style='margin:0 0 6px'><strong>Created by</strong><br/>{escape(host_name)}"
        + (f" &lt;{escape(host_email)}&gt;" if host_email else "")
        + "</p>"
        f"<p style='margin:12px 0 20px'><strong>When</strong><br/>{escape(when)}</p>"
        f"<p style='margin:0 0 12px'><a href='{escape(urls['app'])}' style='display:inline-block;background:{escape(color)};color:{escape(ink)};text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:700'>Join meeting</a></p>"
        f"<p style='margin:0;font-size:13px;color:#64748b'>Guest link:<br/><a href='{escape(urls['guest'])}' style='color:{escape(color)}'>{escape(urls['guest'])}</a></p>"
    )
    html = wrap_branded(brand, inner)
    return await send_mail_many(company, addresses, subject=subject, text=text, html=html)


def can_join(user, meeting) -> bool:
    if not meeting or not user:
        return False
    if user.get("isGuest"):
        return str(meeting.get("_id")) == str(user.get("guestMeetingId") or "")
    uid = str(user.get("_id") or "")
    host = str(meeting.get("host") or "")
    if uid and host and uid == host:
        return True
    invitees = [str(i) for i in (meeting.get("invitees") or []) if i]
    if not invitees:
        return True
    if uid in invitees:
        return True
    return can_see_all(user)


async def load_meeting(meeting_id, user):
    meeting = await get_db().meetings.find_one({"_id": oid(meeting_id)})
    if not meeting:
        fail(404, "Meeting not found")
    if user.get("isGuest"):
        if str(user.get("guestMeetingId")) != str(meeting["_id"]):
            fail(403, "Guest access is only for that meeting")
    else:
        if str(meeting.get("company")) != str(company_id(user)):
            fail(403, "Access denied")
    return meeting


@router.get("/guest/{token}")
async def guest_info(token: str):
    meeting = await get_db().meetings.find_one({"guestToken": token})
    if not meeting:
        fail(404, "Meeting link is invalid")
    host = await get_db().users.find_one({"_id": meeting.get("host")}, {"username": 1, "avatar": 1})
    return dump({
        "title": meeting.get("title"),
        "status": meeting.get("status"),
        "host": {"username": (host or {}).get("username"), "avatar": (host or {}).get("avatar") or ""},
        "language": meeting.get("language") or "en",
        "endedAt": meeting.get("endedAt"),
        "scheduledAt": meeting.get("scheduledAt"),
        "summary": meeting.get("summary") or "",
    })


@router.post("/guest/{token}/session")
async def guest_session(token: str, body: dict = Body(default={})):
    name = str(body.get("name") or "").strip()[:40]
    if not name:
        fail(400, "Enter your name to join")
    db = get_db()
    meeting = await db.meetings.find_one({"guestToken": token})
    if not meeting:
        fail(404, "Meeting link is invalid")
    if meeting.get("status") == "scheduled":
        fail(400, "This meeting has not started yet")
    if meeting.get("status") != "live":
        fail(400, "This meeting has ended")
    from bson import ObjectId
    guest_id = ObjectId()
    participant = {
        "user": guest_id,
        "username": name,
        "isGuest": True,
        "joinedAt": datetime.now(timezone.utc),
        "lastSeen": datetime.now(timezone.utc),
        "avatar": "",
        "handRaised": False,
        "isSharing": False,
        "leftAt": None,
    }
    await db.meetings.update_one({"_id": meeting["_id"]}, {"$push": {"participants": participant}})
    meeting = await db.meetings.find_one({"_id": meeting["_id"]})
    jwt_token = make_token({
        "guest": True,
        "guestId": str(guest_id),
        "meetingId": str(meeting["_id"]),
        "companyId": str(meeting.get("company")),
        "name": name,
    }, hours=12)
    return {"token": jwt_token, "guestId": str(guest_id), "meetingId": str(meeting["_id"]), "meeting": public_meeting(meeting)}


@router.get("/")
async def list_meetings(user=Depends(current_user)):
    db = get_db()
    company = company_id(user)
    live = await db.meetings.find({"company": company, "status": "live"}).sort("createdAt", -1).to_list(50)
    scheduled = await db.meetings.find({"company": company, "status": "scheduled"}).sort("scheduledAt", 1).to_list(80)
    for meeting in live + scheduled:
        if not meeting.get("guestToken"):
            token = secrets.token_hex(16)
            await db.meetings.update_one({"_id": meeting["_id"]}, {"$set": {"guestToken": token}})
            meeting["guestToken"] = token
    ended = await db.meetings.find({"company": company, "status": "ended"}).sort("endedAt", -1).to_list(30)
    from ..serialize import attach
    await attach(db.users, live, "host", ["username", "role", "avatar"])
    await attach(db.users, scheduled, "host", ["username", "role", "avatar"])
    await attach(db.users, ended, "host", ["username", "role", "avatar"])
    listed = [public_meeting(m, True) for m in live]
    upcoming = [public_meeting(m, True) for m in scheduled if can_join(user, m)]
    recents = [public_meeting(m, True) for m in ended]
    return dump({"live": listed, "scheduled": upcoming, "ended": recents, "recent": recents})


@router.post("/")
async def create_meeting(body: dict = Body(default={}), user=Depends(current_user)):
    title = str(body.get("title") or "Team meeting").strip()[:80] or "Team meeting"
    invitees = [oid(i) for i in (body.get("invitees") or []) if oid(i)]
    extra_emails = clean_emails(body.get("emails") or [])
    language = body.get("language") if body.get("language") in LANGUAGE_NAMES else "en"
    scheduled_at = parse_when(body.get("scheduledAt"))
    db = get_db()
    company = company_id(user)
    if extra_emails:
        matched = await db.users.find({"company": company, "email": {"$in": extra_emails}}, {"_id": 1, "email": 1}).to_list(200)
        have = {str(p["_id"]) for p in invitees}
        for person in matched:
            if str(person["_id"]) not in have:
                invitees.append(person["_id"])
                have.add(str(person["_id"]))
    go_live = not scheduled_at or scheduled_at <= datetime.now(timezone.utc)
    now = datetime.now(timezone.utc)
    doc = {
        "company": company,
        "title": title,
        "host": user["_id"],
        "invitees": invitees,
        "inviteEmails": extra_emails,
        "language": language,
        "guestToken": secrets.token_hex(16),
        "status": "live" if go_live else "scheduled",
        "participants": [{
            "user": user["_id"],
            "username": user.get("username"),
            "avatar": user.get("avatar") or "",
            "joinedAt": now,
            "lastSeen": now,
            "isGuest": False,
            "handRaised": False,
            "isSharing": False,
            "leftAt": None,
        }] if go_live else [],
        "notes": [],
        "captions": [],
        "reactions": [],
        "summaries": {},
        "summary": "",
        "scheduledAt": scheduled_at,
        "startedAt": now if go_live else None,
        "endedAt": None,
        "createdAt": now,
    }
    result = await db.meetings.insert_one(doc)
    doc["_id"] = result.inserted_id
    emailed = 0
    try:
        await notify_meeting_invite(db, company_id=company, meeting=doc, host=user, invitee_ids=invitees)
    except Exception:
        pass
    try:
        emailed = await send_meeting_emails(
            db, company=company, meeting=doc, host=user, invitee_ids=invitees, extra_emails=extra_emails
        )
    except Exception:
        emailed = 0
    payload = public_meeting(doc, True)
    payload["emailed"] = emailed
    return payload


@router.post("/{meeting_id}/start")
async def start_scheduled(meeting_id: str, user=Depends(current_user)):
    meeting = await load_meeting(meeting_id, user)
    if str(meeting.get("host")) != str(user["_id"]) and not can_see_all(user):
        fail(403, "Only the host can start this meeting")
    if meeting.get("status") == "live":
        return public_meeting(meeting, True)
    if meeting.get("status") != "scheduled":
        fail(400, "This meeting cannot be started")
    now = datetime.now(timezone.utc)
    patch = {
        "status": "live",
        "startedAt": now,
        "participants": [{
            "user": user["_id"],
            "username": user.get("username"),
            "avatar": user.get("avatar") or "",
            "joinedAt": now,
            "lastSeen": now,
            "isGuest": False,
            "handRaised": False,
            "isSharing": False,
            "leftAt": None,
        }],
    }
    await get_db().meetings.update_one({"_id": meeting["_id"]}, {"$set": patch})
    meeting.update(patch)
    return public_meeting(meeting, True)


@router.get("/{meeting_id}")
async def get_meeting(meeting_id: str, user=Depends(current_user_or_guest)):
    meeting = await load_meeting(meeting_id, user)
    if meeting.get("status") == "live" and not user.get("isGuest") and not can_join(user, meeting):
        fail(403, "You were not invited to this meeting")
    return public_meeting(meeting, include_guest=not user.get("isGuest"))


@router.post("/{meeting_id}/join")
async def join_meeting(meeting_id: str, user=Depends(current_user_or_guest)):
    meeting = await load_meeting(meeting_id, user)
    if meeting.get("status") == "scheduled":
        fail(400, "This meeting has not started yet")
    if meeting.get("status") != "live":
        fail(400, "This meeting has ended")
    guest_user = {**user, "guestMeetingId": user.get("guestMeetingId")}
    if not can_join(guest_user, meeting):
        fail(403, "You were not invited to this meeting")
    db = get_db()
    existing = next((p for p in meeting.get("participants") or [] if str(p.get("user")) == str(user["_id"])), None)
    avatar = "" if user.get("isGuest") else (user.get("avatar") or "")
    if existing:
        await db.meetings.update_one(
            {"_id": meeting["_id"], "participants.user": user["_id"]},
            {"$set": {
                "participants.$.lastSeen": datetime.now(timezone.utc),
                "participants.$.leftAt": None,
                "participants.$.username": user.get("username"),
                "participants.$.isGuest": bool(user.get("isGuest")),
                "participants.$.avatar": avatar,
            }},
        )
    else:
        await db.meetings.update_one({"_id": meeting["_id"]}, {"$push": {"participants": {
            "user": user["_id"],
            "username": user.get("username"),
            "avatar": avatar,
            "isGuest": bool(user.get("isGuest")),
            "joinedAt": datetime.now(timezone.utc),
            "lastSeen": datetime.now(timezone.utc),
            "handRaised": False,
            "isSharing": False,
            "leftAt": None,
        }}})
    meeting = await db.meetings.find_one({"_id": meeting["_id"]})
    return public_meeting(meeting, include_guest=not user.get("isGuest"))


@router.post("/{meeting_id}/heartbeat")
async def heartbeat(meeting_id: str, body: dict = Body(default={}), user=Depends(current_user_or_guest)):
    meeting = await load_meeting(meeting_id, user)
    if meeting.get("status") != "live":
        return public_meeting(meeting)
    patch = {"participants.$.lastSeen": datetime.now(timezone.utc), "participants.$.leftAt": None}
    if isinstance(body.get("sharing"), bool):
        patch["participants.$.isSharing"] = body["sharing"]
    await get_db().meetings.update_one({"_id": meeting["_id"], "participants.user": user["_id"]}, {"$set": patch})
    meeting = await get_db().meetings.find_one({"_id": meeting["_id"]})
    return public_meeting(meeting, include_guest=not user.get("isGuest"))


@router.post("/{meeting_id}/leave")
async def leave_meeting(meeting_id: str, user=Depends(current_user_or_guest)):
    meeting = await load_meeting(meeting_id, user)
    await get_db().meetings.update_one(
        {"_id": meeting["_id"], "participants.user": user["_id"]},
        {"$set": {"participants.$.leftAt": datetime.now(timezone.utc), "participants.$.handRaised": False, "participants.$.isSharing": False}},
    )
    return {"ok": True}


@router.post("/{meeting_id}/notes")
async def add_note(meeting_id: str, body: dict = Body(default={}), user=Depends(current_user_or_guest)):
    text = str(body.get("text") or "").strip()[:2000]
    if not text:
        fail(400, "Note is empty")
    meeting = await load_meeting(meeting_id, user)
    note = {"user": user["_id"], "username": user.get("username"), "avatar": user.get("avatar") or "", "text": text, "at": datetime.now(timezone.utc)}
    updated = await get_db().meetings.find_one_and_update({"_id": meeting["_id"]}, {"$push": {"notes": note}}, return_document=ReturnDocument.AFTER)
    return dump(updated.get("notes") or [])


@router.post("/{meeting_id}/hand")
async def toggle_hand(meeting_id: str, body: dict = Body(default={}), user=Depends(current_user_or_guest)):
    meeting = await load_meeting(meeting_id, user)
    await get_db().meetings.update_one(
        {"_id": meeting["_id"], "participants.user": user["_id"]},
        {"$set": {"participants.$.handRaised": bool(body.get("raised")), "participants.$.lastSeen": datetime.now(timezone.utc)}},
    )
    meeting = await get_db().meetings.find_one({"_id": meeting["_id"]})
    return public_meeting(meeting)


@router.post("/{meeting_id}/react")
async def react(meeting_id: str, body: dict = Body(default={}), user=Depends(current_user_or_guest)):
    emoji = str(body.get("emoji") or "").strip()[:8]
    if not emoji:
        fail(400, "Pick an emoji")
    meeting = await load_meeting(meeting_id, user)
    reactions = (meeting.get("reactions") or [])[-30:]
    reactions.append({"user": user["_id"], "username": user.get("username"), "emoji": emoji, "at": datetime.now(timezone.utc)})
    await get_db().meetings.update_one({"_id": meeting["_id"]}, {"$set": {"reactions": reactions}})
    meeting["reactions"] = reactions
    return dump(recent_reactions(meeting))


@router.post("/{meeting_id}/captions")
async def captions(meeting_id: str, body: dict = Body(default={}), user=Depends(current_user_or_guest)):
    text = re.sub(r"\s+", " ", str(body.get("text") or "")).strip()[:400]
    if not text:
        return {"ok": True}
    language = body.get("lang") if body.get("lang") in LANGUAGE_NAMES else "en"
    meeting = await load_meeting(meeting_id, user)
    if meeting.get("status") != "live":
        fail(400, "Meeting has ended")
    row = {"user": user["_id"], "username": user.get("username"), "text": text, "lang": language, "final": bool(body.get("final")), "at": datetime.now(timezone.utc)}
    caps = list(meeting.get("captions") or [])
    if caps and not caps[-1].get("final") and str(caps[-1].get("user")) == str(user["_id"]):
        caps[-1] = row
    else:
        caps.append(row)
    caps = caps[-40:]
    await get_db().meetings.update_one({"_id": meeting["_id"]}, {"$set": {"captions": caps}})
    meeting["captions"] = caps
    return {"ok": True, "captions": dump(recent_captions(meeting))}


@router.post("/{meeting_id}/translate")
async def translate(meeting_id: str, body: dict = Body(default={}), user=Depends(current_user_or_guest)):
    text = str(body.get("text") or "").strip()[:800]
    language = str(body.get("language") or "en")
    if language not in LANGUAGE_NAMES:
        fail(400, "Unsupported language")
    await load_meeting(meeting_id, user)
    if not text:
        return {"text": "", "language": language}
    try:
        translated = await invoke_text(company_id(user), f"Translate into {LANGUAGE_NAMES[language]}. Plain text only.", text)
    except Exception:
        translated = text
    return {"text": translated or text, "language": language}


@router.post("/{meeting_id}/summary")
async def change_summary_language(meeting_id: str, body: dict = Body(default={}), user=Depends(current_user_or_guest)):
    language = str(body.get("language") or "en")
    if language not in LANGUAGE_NAMES:
        fail(400, "Unsupported language")
    meeting = await load_meeting(meeting_id, user)
    if meeting.get("status") != "ended":
        fail(400, "Summary is ready after the meeting ends")
    cached = (meeting.get("summaries") or {}).get(language)
    if cached:
        payload = public_meeting(meeting, include_guest=not user.get("isGuest"))
        payload["summary"] = cached
        payload["language"] = language
        return payload
    source = meeting.get("summary") or ""
    try:
        translated = await invoke_text(company_id(user), f"Translate the meeting summary into {LANGUAGE_NAMES[language]}. Plain text only. No markdown.", source) if source else source
    except Exception:
        translated = source
    summaries = {**(meeting.get("summaries") or {}), language: translated}
    await get_db().meetings.update_one({"_id": meeting["_id"]}, {"$set": {"summaries": summaries}})
    meeting["summaries"] = summaries
    payload = public_meeting(meeting, include_guest=not user.get("isGuest"))
    payload["summary"] = translated
    payload["language"] = language
    return payload


@router.put("/{meeting_id}/language")
async def set_language(meeting_id: str, body: dict = Body(default={}), user=Depends(current_user_or_guest)):
    language = str(body.get("language") or "en")
    if language not in LANGUAGE_NAMES:
        fail(400, "Unsupported language")
    meeting = await load_meeting(meeting_id, user)
    await get_db().meetings.update_one({"_id": meeting["_id"]}, {"$set": {"language": language}})
    meeting["language"] = language
    return public_meeting(meeting, include_guest=not user.get("isGuest"))


@router.post("/{meeting_id}/signal")
async def send_signal(meeting_id: str, body: dict = Body(default={}), user=Depends(current_user_or_guest)):
    to, kind, payload = body.get("to"), body.get("kind"), body.get("payload") or {}
    if not to or kind not in ("offer", "answer", "ice", "hangup"):
        fail(400, "Invalid signal")
    meeting = await load_meeting(meeting_id, user)
    if meeting.get("status") != "live":
        fail(404, "Live meeting not found")
    row = {
        "meeting": meeting["_id"],
        "from": user["_id"],
        "to": oid(to) or to,
        "kind": kind,
        "payload": payload,
        "createdAt": datetime.now(timezone.utc),
    }
    result = await get_db().meetingsignals.insert_one(row)
    return {"id": str(result.inserted_id)}


@router.get("/{meeting_id}/signals")
async def get_signals(meeting_id: str, after: str | None = Query(default=None), user=Depends(current_user_or_guest)):
    await load_meeting(meeting_id, user)
    filt = {"meeting": oid(meeting_id), "to": user["_id"]}
    if after and oid(after):
        filt["_id"] = {"$gt": oid(after)}
    else:
        from datetime import timedelta
        filt["createdAt"] = {"$gte": datetime.now(timezone.utc) - timedelta(seconds=15)}
    rows = await get_db().meetingsignals.find(filt).sort("_id", 1).to_list(50)
    return dump(rows)


@router.post("/{meeting_id}/end")
async def end_meeting(meeting_id: str, body: dict = Body(default={}), user=Depends(current_user)):
    if user.get("isGuest"):
        fail(403, "Guests cannot end the meeting")
    meeting = await load_meeting(meeting_id, user)
    is_host = str(meeting.get("host")) == str(user["_id"])
    if not is_host and not can_see_all(user):
        fail(403, "Only the host can end this meeting")
    if meeting.get("status") == "ended":
        return public_meeting(meeting, True)
    extra = str(body.get("notes") or "").strip()
    notes = list(meeting.get("notes") or [])
    if extra:
        notes.append({"user": user["_id"], "username": user.get("username"), "text": extra, "at": datetime.now(timezone.utc)})
    ended_at = datetime.now(timezone.utc)
    started = meeting.get("startedAt") or ended_at
    duration_minutes = max(1, round((ended_at - started).total_seconds() / 60))
    language = meeting.get("language") or "en"
    people = ", ".join(p.get("username") or "" for p in meeting.get("participants") or []) or "unknown"
    note_text = "\n".join(f"{n.get('username')}: {n.get('text')}" for n in notes) or "(no notes)"
    caption_text = "\n".join(f"{c.get('username')}: {c.get('text')}" for c in meeting.get("captions") or [] if c.get("final") and c.get("text"))
    transcript = "\n\n".join(part for part in [note_text and f"Notes:\n{note_text}", caption_text and f"Spoken captions:\n{caption_text}"] if part) or "(no notes)"
    try:
        summary = await invoke_text(
            company_id(user),
            f"You write concise meeting summaries for a work team in {LANGUAGE_NAMES.get(language, 'English')}. Use short sections labelled Overview, Decisions, Action items, Follow-ups. Plain text only. No markdown.",
            f"Meeting: {meeting.get('title')}\nDuration: {duration_minutes} minutes\nParticipants: {people}\n\n{transcript}",
        )
    except Exception:
        summary = f"{meeting.get('title')}\nDuration: {duration_minutes} min\nParticipants: {people}\n\n{note_text}"
    summary = clean_summary(summary)
    participants = meeting.get("participants") or []
    for p in participants:
        if not p.get("leftAt"):
            p["leftAt"] = ended_at
        p["handRaised"] = False
        p["isSharing"] = False
    await get_db().meetings.update_one({"_id": meeting["_id"]}, {"$set": {
        "status": "ended",
        "endedAt": ended_at,
        "notes": notes,
        "participants": participants,
        "summary": summary,
        "summaries": {language: summary},
    }})
    meeting.update({"status": "ended", "endedAt": ended_at, "notes": notes, "summary": summary, "summaries": {language: summary}, "participants": participants})
    return public_meeting(meeting, True)
