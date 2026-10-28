from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Body, Depends, File, Form, Query, UploadFile
from fastapi.responses import Response
from pymongo import ReturnDocument

from ..db import get_db
from ..deps import company_id, current_user, fail
from ..roles import can_assign_others, is_team_lead, team_member_ids
from ..serialize import dump, map_by_id, oid
from ..services.notify import notify_new_message

router = APIRouter(prefix="/api/messages", tags=["messages"])
MAX_FILE = 10 * 1024 * 1024
MAX_FILES = 5


def public_person(p):
    return dump({"_id": p.get("_id"), "username": p.get("username"), "role": p.get("role"), "avatar": p.get("avatar") or ""})


def direct_key(a, b):
    return ":".join(sorted([str(a), str(b)]))


def team_key(ids):
    return "team:" + ":".join(sorted(str(i) for i in ids))


def shape(conversation, user, unread_map, people_map):
    base = {
        "_id": conversation["_id"],
        "type": conversation.get("type"),
        "name": conversation.get("name"),
        "lastMessageText": conversation.get("lastMessageText"),
        "lastMessageAt": conversation.get("lastMessageAt"),
        "lastSender": people_map.get(str(conversation.get("lastSender"))) if conversation.get("lastSender") else None,
        "unread": unread_map.get(str(conversation["_id"]), 0),
    }
    if conversation.get("type") == "direct":
        other_id = next((i for i in conversation.get("participants") or [] if str(i) != str(user["_id"])), None)
        base["other"] = people_map.get(str(other_id)) if other_id else {"_id": other_id, "username": "Unknown"}
        base["name"] = (base["other"] or {}).get("username") or "Direct message"
    if conversation.get("type") == "team":
        base["memberCount"] = len(conversation.get("participants") or [])
        base["name"] = conversation.get("name") or "Team chat"
    return dump(base)


async def company_channel(db, company, user_id):
    channel = await db.conversations.find_one({"company": company, "type": "company"})
    if channel:
        return channel
    doc = {"company": company, "type": "company", "name": "general", "participants": [], "createdBy": user_id, "createdAt": datetime.now(timezone.utc)}
    try:
        result = await db.conversations.insert_one(doc)
        doc["_id"] = result.inserted_id
        return doc
    except Exception:
        return await db.conversations.find_one({"company": company, "type": "company"})


async def load_conversation(db, conversation_id, user):
    conversation = await db.conversations.find_one({"_id": oid(conversation_id), "company": company_id(user)})
    if not conversation:
        return None
    if conversation.get("type") == "company":
        return conversation
    if any(str(p) == str(user["_id"]) for p in conversation.get("participants") or []):
        return conversation
    return None


@router.get("/conversations")
async def list_conversations(user=Depends(current_user)):
    db = get_db()
    company = company_id(user)
    channel = await company_channel(db, company, user["_id"])
    directs = await db.conversations.find({
        "company": company,
        "type": {"$in": ["direct", "team"]},
        "participants": user["_id"],
    }).sort([("lastMessageAt", -1), ("createdAt", -1)]).to_list(200)
    all_rows = [channel, *directs]
    since = datetime.now(timezone.utc) - timedelta(days=7)
    unread_map = {}
    for row in all_rows:
        count = await db.messages.count_documents({
            "conversation": row["_id"],
            "sender": {"$ne": user["_id"]},
            "readBy": {"$ne": user["_id"]},
            "createdAt": {"$gte": since},
        })
        unread_map[str(row["_id"])] = count
    people_ids = set()
    for row in all_rows:
        for pid in row.get("participants") or []:
            people_ids.add(str(pid))
        if row.get("lastSender"):
            people_ids.add(str(row["lastSender"]))
    people = await map_by_id(db.users, list(people_ids), ["username", "role", "avatar"])
    people_map = {k: public_person(v) for k, v in people.items()}
    return [shape(row, user, unread_map, people_map) for row in all_rows]


@router.post("/conversations/direct")
async def start_direct(body: dict = Body(default={}), user=Depends(current_user)):
    other_id = body.get("userId")
    if not other_id:
        fail(400, "userId is required")
    if str(other_id) == str(user["_id"]):
        fail(400, "You cannot message yourself")
    db = get_db()
    other = await db.users.find_one({"_id": oid(other_id), "company": company_id(user)}, {"username": 1, "role": 1, "avatar": 1})
    if not other:
        fail(404, "User not found in your company")
    key = direct_key(user["_id"], other["_id"])
    conversation = await db.conversations.find_one({"company": company_id(user), "directKey": key})
    if not conversation:
        doc = {
            "company": company_id(user),
            "type": "direct",
            "participants": [user["_id"], other["_id"]],
            "directKey": key,
            "createdBy": user["_id"],
            "createdAt": datetime.now(timezone.utc),
        }
        try:
            result = await db.conversations.insert_one(doc)
            doc["_id"] = result.inserted_id
            conversation = doc
        except Exception:
            conversation = await db.conversations.find_one({"company": company_id(user), "directKey": key})
    people_map = {str(other["_id"]): public_person(other), str(user["_id"]): public_person(user)}
    return shape(conversation, user, {}, people_map)


@router.post("/conversations/team")
async def start_team(body: dict = Body(default={}), user=Depends(current_user)):
    if not can_assign_others(user):
        fail(403, "Only admin, manager or team lead can create a team chat")
    db = get_db()
    company = company_id(user)
    participant_ids = [str(i) for i in (body.get("participantIds") or [])]
    name = str(body.get("name") or "").strip()
    if is_team_lead(user) and not participant_ids:
        members = await team_member_ids(db, user["_id"], company)
        participant_ids = [str(i) for i in members]
    unique = list(dict.fromkeys([str(user["_id"]), *participant_ids]))
    if len(unique) < 2:
        fail(400, "Add at least one teammate to the chat")
    people_docs = await db.users.find({"_id": {"$in": [oid(i) for i in unique]}, "company": company}, {"username": 1, "role": 1, "avatar": 1}).to_list(100)
    if len(people_docs) != len(unique):
        fail(400, "One or more people are not in your company")
    if is_team_lead(user):
        allowed = {str(user["_id"]), *[str(i) for i in await team_member_ids(db, user["_id"], company)]}
        if any(i not in allowed for i in unique):
            fail(403, "Team leads can only chat with their own members")
    key = team_key(unique)
    conversation = await db.conversations.find_one({"company": company, "type": "team", "directKey": key})
    if not conversation:
        doc = {
            "company": company,
            "type": "team",
            "name": name or (f"{user['username']}'s team" if user.get("role") == "team_lead" else "Team chat"),
            "participants": [oid(i) for i in unique],
            "directKey": key,
            "createdBy": user["_id"],
            "createdAt": datetime.now(timezone.utc),
        }
        try:
            result = await db.conversations.insert_one(doc)
            doc["_id"] = result.inserted_id
            conversation = doc
        except Exception:
            conversation = await db.conversations.find_one({"company": company, "type": "team", "directKey": key})
    elif name:
        conversation = await db.conversations.find_one_and_update({"_id": conversation["_id"]}, {"$set": {"name": name}}, return_document=ReturnDocument.AFTER)
    people_map = {str(p["_id"]): public_person(p) for p in people_docs}
    return shape(conversation, user, {}, people_map)


@router.get("/conversations/{conversation_id}/messages")
async def list_messages(conversation_id: str, before: str | None = Query(default=None), after: str | None = Query(default=None), limit: int = Query(default=50), user=Depends(current_user)):
    db = get_db()
    conversation = await load_conversation(db, conversation_id, user)
    if not conversation:
        fail(404, "Conversation not found")
    limit = min(max(limit, 1), 200)
    filt = {"conversation": conversation["_id"]}
    created = {}
    if before:
        created["$lt"] = datetime.fromisoformat(before.replace("Z", "+00:00"))
    if after:
        created["$gt"] = datetime.fromisoformat(after.replace("Z", "+00:00"))
    if created:
        filt["createdAt"] = created
    messages = await db.messages.find(filt).sort("createdAt", -1).to_list(limit)
    messages.reverse()
    people_ids = [m.get("sender") for m in messages] + list(conversation.get("participants") or [])
    people = await map_by_id(db.users, people_ids, ["username", "role", "avatar"])
    people_map = {k: public_person(v) for k, v in people.items()}
    for msg in messages:
        sender = people_map.get(str(msg.get("sender")))
        msg["sender"] = sender if sender else {"_id": dump(msg.get("sender"))}
    return dump({
        "conversation": shape(conversation, user, {}, people_map),
        "messages": messages,
        "hasMore": len(messages) == limit,
    })


@router.post("/conversations/{conversation_id}/messages")
async def send_message(
    conversation_id: str,
    text: str = Form(default=""),
    files: list[UploadFile] | None = File(default=None),
    user=Depends(current_user),
):
    db = get_db()
    conversation = await load_conversation(db, conversation_id, user)
    if not conversation:
        fail(404, "Conversation not found")
    uploads = files or []
    if len(uploads) > MAX_FILES:
        fail(400, f"You can attach up to {MAX_FILES} files per message")
    body = text.strip()
    if not body and not uploads:
        fail(400, "Type a message or attach a file")
    attachments = []
    for file in uploads:
        data = await file.read()
        if len(data) > MAX_FILE:
            fail(400, "Each file must be 10 MB or smaller")
        stored = {
            "company": company_id(user),
            "uploadedBy": user["_id"],
            "conversation": conversation["_id"],
            "filename": file.filename or "file",
            "mimeType": file.content_type or "application/octet-stream",
            "size": len(data),
            "data": data,
            "createdAt": datetime.now(timezone.utc),
        }
        result = await db.attachments.insert_one(stored)
        attachments.append({
            "attachment": result.inserted_id,
            "filename": stored["filename"],
            "mimeType": stored["mimeType"],
            "size": stored["size"],
        })
    message = {
        "conversation": conversation["_id"],
        "company": company_id(user),
        "sender": user["_id"],
        "text": body,
        "attachments": attachments,
        "readBy": [user["_id"]],
        "createdAt": datetime.now(timezone.utc),
    }
    result = await db.messages.insert_one(message)
    message["_id"] = result.inserted_id
    preview = body[:140] if body else f"Sent {len(attachments)} file{'s' if len(attachments) != 1 else ''}: {attachments[0]['filename']}"
    await db.conversations.update_one({"_id": conversation["_id"]}, {"$set": {
        "lastMessageText": preview,
        "lastMessageAt": message["createdAt"],
        "lastSender": user["_id"],
    }})
    message["sender"] = public_person(user)
    if conversation.get("type") == "company":
        recipients = await db.users.distinct("_id", {"company": company_id(user)})
    else:
        recipients = conversation.get("participants") or []
    await notify_new_message(db, company_id=company_id(user), recipients=recipients, sender=user, conversation=conversation, preview=preview)
    return dump(message)


@router.post("/conversations/{conversation_id}/read")
async def mark_read(conversation_id: str, user=Depends(current_user)):
    db = get_db()
    conversation = await load_conversation(db, conversation_id, user)
    if not conversation:
        fail(404, "Conversation not found")
    await db.messages.update_many(
        {"conversation": conversation["_id"], "readBy": {"$ne": user["_id"]}},
        {"$addToSet": {"readBy": user["_id"]}},
    )
    return {"ok": True}


@router.get("/attachments/{attachment_id}")
async def get_attachment(attachment_id: str, token: str | None = Query(default=None), user=Depends(current_user)):
    db = get_db()
    row = await db.attachments.find_one({"_id": oid(attachment_id)})
    if not row or str(row.get("company")) != str(company_id(user)):
        fail(404, "Attachment not found")
    return Response(content=bytes(row.get("data") or b""), media_type=row.get("mimeType") or "application/octet-stream", headers={
        "Content-Disposition": f'inline; filename="{row.get("filename") or "file"}"'
    })
