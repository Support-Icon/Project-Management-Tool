from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Body, Depends, Query
from pymongo import ReturnDocument

from ..db import get_db
from ..deps import company_id, current_user, fail
from ..duration import IST, today_in_zone
from ..roles import can_see_all, is_team_lead, team_member_ids
from ..serialize import attach, dump, oid
from ..services.notify import notify_leave_decision, notify_leave_requested

router = APIRouter(prefix="/api/leaves", tags=["leaves"])


def dates_between(start: str, end: str) -> list[str]:
    try:
        cursor = datetime.fromisoformat(start)
        last = datetime.fromisoformat(end)
    except ValueError:
        return []
    out = []
    while cursor <= last:
        out.append(cursor.date().isoformat())
        cursor += timedelta(days=1)
        if len(out) > 31:
            break
    return out


async def can_review(db, actor, target_id, company) -> bool:
    if can_see_all(actor):
        return True
    if is_team_lead(actor):
        ids = await team_member_ids(db, actor["_id"], company)
        return str(target_id) in {str(i) for i in ids}
    return False


@router.get("/")
async def list_leaves(mine: str | None = Query(default=None), status: str | None = Query(default=None), user=Depends(current_user)):
    db = get_db()
    company = company_id(user)
    filt = {"company": company}
    if mine == "true" or (not can_see_all(user) and not is_team_lead(user)):
        filt["user"] = user["_id"]
    elif is_team_lead(user) and not can_see_all(user):
        members = await team_member_ids(db, user["_id"], company)
        filt["user"] = {"$in": [user["_id"], *members]}
    if status:
        filt["status"] = status
    docs = await db.leaverequests.find(filt).sort("createdAt", -1).to_list(200)
    await attach(db.users, docs, "user", ["username", "role", "teamLead"])
    await attach(db.users, docs, "reviewedBy", ["username", "role"])
    return dump(docs)


@router.get("/today")
async def today_leave(user=Depends(current_user)):
    date = today_in_zone(IST)
    row = await get_db().leaverequests.find_one(
        {
            "company": company_id(user),
            "user": user["_id"],
            "status": {"$in": ["approved", "pending"]},
            "startDate": {"$lte": date},
            "endDate": {"$gte": date},
        },
        sort=[("status", 1)],
    )
    return dump(row)


@router.post("/")
async def request_leave(body: dict = Body(default={}), user=Depends(current_user)):
    start = str(body.get("startDate") or "")[:10]
    end = str(body.get("endDate") or start)[:10]
    reason = str(body.get("reason") or "").strip()
    if len(start) != 10 or len(end) != 10:
        fail(400, "Start and end dates are required")
    if end < start:
        fail(400, "End date cannot be before start date")
    span = dates_between(start, end)
    if not span:
        fail(400, "Invalid date range")
    if len(span) > 31:
        fail(400, "Leave cannot exceed 31 days")
    db = get_db()
    overlap = await db.leaverequests.find_one({
        "company": company_id(user),
        "user": user["_id"],
        "status": {"$in": ["pending", "approved"]},
        "startDate": {"$lte": end},
        "endDate": {"$gte": start},
    })
    if overlap:
        fail(400, "You already have leave covering these dates")
    doc = {
        "company": company_id(user),
        "user": user["_id"],
        "startDate": start,
        "endDate": end,
        "reason": reason,
        "status": "pending",
        "reviewedBy": None,
        "reviewedAt": None,
        "reviewNote": "",
        "createdAt": datetime.now(timezone.utc),
    }
    result = await db.leaverequests.insert_one(doc)
    doc["_id"] = result.inserted_id
    leaders = await db.users.find({"company": company_id(user), "role": {"$in": ["admin", "manager"]}}, {"_id": 1}).to_list(50)
    reviewer_ids = [str(u["_id"]) for u in leaders]
    if user.get("teamLead"):
        reviewer_ids.append(str(user["teamLead"]))
    reviewer_ids = [i for i in dict.fromkeys(reviewer_ids) if i != str(user["_id"])]
    await notify_leave_requested(db, company_id=company_id(user), request=doc, requester=user, reviewer_ids=reviewer_ids)
    docs = [await db.leaverequests.find_one({"_id": result.inserted_id})]
    await attach(db.users, docs, "user", ["username", "role"])
    return dump(docs[0])


@router.post("/{leave_id}/cancel")
async def cancel_leave(leave_id: str, user=Depends(current_user)):
    db = get_db()
    row = await db.leaverequests.find_one({"_id": oid(leave_id), "company": company_id(user), "user": user["_id"]})
    if not row:
        fail(404, "Leave request not found")
    if row.get("status") != "pending":
        fail(400, "Only pending requests can be cancelled")
    updated = await db.leaverequests.find_one_and_update(
        {"_id": row["_id"]},
        {"$set": {"status": "cancelled"}},
        return_document=ReturnDocument.AFTER,
    )
    return dump(updated)


@router.post("/{leave_id}/review")
async def review_leave(leave_id: str, body: dict = Body(default={}), user=Depends(current_user)):
    decision = str(body.get("decision") or "").lower()
    if decision not in ("approved", "rejected"):
        fail(400, "Decision must be approved or rejected")
    db = get_db()
    row = await db.leaverequests.find_one({"_id": oid(leave_id), "company": company_id(user)})
    if not row:
        fail(404, "Leave request not found")
    if row.get("status") != "pending":
        fail(400, "This request was already reviewed")
    if str(row.get("user")) == str(user["_id"]):
        fail(400, "You cannot review your own leave")
    if not await can_review(db, user, row.get("user"), company_id(user)):
        fail(403, "You cannot review this request")
    updated = await db.leaverequests.find_one_and_update(
        {"_id": row["_id"]},
        {"$set": {
            "status": decision,
            "reviewedBy": user["_id"],
            "reviewedAt": datetime.now(timezone.utc),
            "reviewNote": str(body.get("note") or "").strip(),
        }},
        return_document=ReturnDocument.AFTER,
    )
    if decision == "approved":
        for day in dates_between(row["startDate"], row["endDate"]):
            await db.attendances.update_one(
                {"company": company_id(user), "user": row["user"], "date": day},
                {"$set": {"status": "leave", "startAt": None, "endAt": None, "breaks": []},
                 "$setOnInsert": {"company": company_id(user), "user": row["user"], "date": day}},
                upsert=True,
            )
    await notify_leave_decision(db, company_id=company_id(user), request=updated, member_id=row["user"], approved=decision == "approved", reviewer=user)
    docs = [updated]
    await attach(db.users, docs, "user", ["username", "role"])
    await attach(db.users, docs, "reviewedBy", ["username", "role"])
    return dump(docs[0])
