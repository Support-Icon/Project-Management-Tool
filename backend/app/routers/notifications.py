from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from pymongo import ReturnDocument

from ..db import get_db
from ..deps import company_id, current_user, fail
from ..serialize import attach, dump, oid

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


async def unread_messages(db, user) -> int:
    since = datetime.now(timezone.utc) - timedelta(days=7)
    convos = await db.conversations.find(
        {"company": company_id(user), "$or": [{"type": "company"}, {"participants": user["_id"]}]},
        {"_id": 1},
    ).to_list(500)
    if not convos:
        return 0
    return await db.messages.count_documents({
        "conversation": {"$in": [c["_id"] for c in convos]},
        "sender": {"$ne": user["_id"]},
        "readBy": {"$ne": user["_id"]},
        "createdAt": {"$gte": since},
    })


@router.get("/")
async def list_notifications(since: str | None = Query(default=None), limit: int = Query(default=30), user=Depends(current_user)):
    db = get_db()
    limit = min(max(limit, 1), 100)
    filt = {"user": user["_id"]}
    if since:
        try:
            filt["createdAt"] = {"$gt": datetime.fromisoformat(since.replace("Z", "+00:00"))}
        except ValueError:
            pass
    items = await db.notifications.find({**filt, "read": False}).sort("createdAt", -1).to_list(limit)
    await attach(db.users, items, "actor", ["username", "avatar"])
    unread_count = await db.notifications.count_documents({"user": user["_id"], "read": False})
    return dump({
        "items": items,
        "unreadCount": unread_count,
        "unreadMessages": await unread_messages(db, user),
        "serverTime": datetime.now(timezone.utc),
    })


@router.post("/read-all")
async def read_all(user=Depends(current_user)):
    await get_db().notifications.update_many(
        {"user": user["_id"], "read": False},
        {"$set": {"read": True, "readAt": datetime.now(timezone.utc)}},
    )
    return {"message": "All notifications marked as read"}


@router.put("/{note_id}/read")
async def read_one(note_id: str, user=Depends(current_user)):
    item = await get_db().notifications.find_one_and_update(
        {"_id": oid(note_id), "user": user["_id"]},
        {"$set": {"read": True, "readAt": datetime.now(timezone.utc)}},
        return_document=ReturnDocument.AFTER,
    )
    if not item:
        fail(404, "Notification not found")
    return dump(item)


@router.delete("/{note_id}")
async def delete_one(note_id: str, user=Depends(current_user)):
    await get_db().notifications.delete_one({"_id": oid(note_id), "user": user["_id"]})
    return {"message": "Notification removed"}
