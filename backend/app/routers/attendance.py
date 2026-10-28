from datetime import datetime, timezone

from fastapi import APIRouter, Body, Depends, Query
from fastapi.responses import PlainTextResponse

from ..db import get_db
from ..deps import company_id, current_user, fail
from ..duration import IST, format_ist, today_in_zone
from ..roles import can_see_all, is_team_lead, team_member_ids
from ..serialize import dump, oid

router = APIRouter(prefix="/api/attendance", tags=["attendance"])


def hours_between(start, end, breaks=None):
    if not start:
        return None
    stop = end or datetime.now(timezone.utc)
    if getattr(stop, "tzinfo", None) is None:
        stop = stop.replace(tzinfo=timezone.utc)
    start_dt = start if getattr(start, "tzinfo", None) else start.replace(tzinfo=timezone.utc)
    ms = (stop - start_dt).total_seconds() * 1000
    for item in breaks or []:
        if not item.get("startAt"):
            continue
        b_end = item.get("endAt") or stop
        b_start = item["startAt"]
        ms -= max(0, (b_end - b_start).total_seconds() * 1000)
    if ms <= 0:
        return 0
    return round(ms / 3600000, 2)


def break_hours(breaks=None, fallback_end=None):
    ms = 0
    stop = fallback_end or datetime.now(timezone.utc)
    for item in breaks or []:
        if not item.get("startAt"):
            continue
        b_end = item.get("endAt") or stop
        ms += max(0, (b_end - item["startAt"]).total_seconds() * 1000)
    return round(ms / 3600000, 2)


def on_break(row) -> bool:
    return any(b.get("startAt") and not b.get("endAt") for b in (row or {}).get("breaks") or [])


def close_open_break(row, at=None):
    at = at or datetime.now(timezone.utc)
    for item in row.get("breaks") or []:
        if item.get("startAt") and not item.get("endAt"):
            item["endAt"] = at


async def leave_for_date(db, company, user_id, date):
    row = await db.leaverequests.find_one(
        {
            "company": company,
            "user": user_id,
            "status": {"$in": ["approved", "pending"]},
            "startDate": {"$lte": date},
            "endDate": {"$gte": date},
        },
        sort=[("status", 1)],
    )
    if not row:
        return {"status": None, "requestId": None}
    return {"status": row.get("status"), "requestId": row.get("_id")}


def serialize(row, leave):
    data = row or {}
    return dump({
        "date": data.get("date"),
        "status": data.get("status") or "working",
        "startAt": data.get("startAt"),
        "endAt": data.get("endAt"),
        "breaks": data.get("breaks") or [],
        "onBreak": on_break(data),
        "hours": hours_between(data.get("startAt"), data.get("endAt"), data.get("breaks")),
        "breakHours": break_hours(data.get("breaks"), data.get("endAt")),
        "leave": leave,
    })


async def get_or_create(db, company, user_id, date):
    existing = await db.attendances.find_one({"company": company, "user": user_id, "date": date})
    if existing:
        return existing
    doc = {"company": company, "user": user_id, "date": date, "status": "working", "startAt": None, "endAt": None, "breaks": []}
    result = await db.attendances.insert_one(doc)
    doc["_id"] = result.inserted_id
    return doc


@router.get("/today")
async def today(user=Depends(current_user)):
    date = today_in_zone(IST)
    db = get_db()
    row = await db.attendances.find_one({"company": company_id(user), "user": user["_id"], "date": date})
    leave = await leave_for_date(db, company_id(user), user["_id"], date)
    return serialize(row or {"date": date, "status": "working", "startAt": None, "endAt": None, "breaks": []}, leave)


@router.post("/start")
async def start_day(user=Depends(current_user)):
    date = today_in_zone(IST)
    db = get_db()
    leave = await leave_for_date(db, company_id(user), user["_id"], date)
    if leave.get("status") == "approved":
        fail(400, "You are on approved leave today")
    row = await get_or_create(db, company_id(user), user["_id"], date)
    if row.get("status") in ("leave", "off"):
        fail(400, "You are on leave / off today")
    if row.get("startAt"):
        return serialize(row, leave)
    row["status"] = "working"
    row["startAt"] = datetime.now(timezone.utc)
    await db.attendances.update_one({"_id": row["_id"]}, {"$set": {"status": "working", "startAt": row["startAt"]}})
    return serialize(row, leave)


@router.post("/end")
async def end_day(user=Depends(current_user)):
    date = today_in_zone(IST)
    db = get_db()
    row = await get_or_create(db, company_id(user), user["_id"], date)
    if not row.get("startAt"):
        fail(400, "Start the day first")
    leave = await leave_for_date(db, company_id(user), user["_id"], date)
    if row.get("endAt"):
        return serialize(row, leave)
    close_open_break(row)
    row["endAt"] = datetime.now(timezone.utc)
    await db.attendances.update_one({"_id": row["_id"]}, {"$set": {"breaks": row.get("breaks") or [], "endAt": row["endAt"]}})
    return serialize(row, leave)


@router.post("/break/start")
async def start_break(user=Depends(current_user)):
    date = today_in_zone(IST)
    db = get_db()
    row = await get_or_create(db, company_id(user), user["_id"], date)
    if not row.get("startAt") or row.get("endAt"):
        fail(400, "Start your day first")
    leave = await leave_for_date(db, company_id(user), user["_id"], date)
    if on_break(row):
        return serialize(row, leave)
    row.setdefault("breaks", []).append({"startAt": datetime.now(timezone.utc), "endAt": None})
    await db.attendances.update_one({"_id": row["_id"]}, {"$set": {"breaks": row["breaks"]}})
    return serialize(row, leave)


@router.post("/break/end")
async def end_break(user=Depends(current_user)):
    date = today_in_zone(IST)
    db = get_db()
    row = await get_or_create(db, company_id(user), user["_id"], date)
    if not on_break(row):
        fail(400, "You are not on a break")
    close_open_break(row)
    await db.attendances.update_one({"_id": row["_id"]}, {"$set": {"breaks": row.get("breaks") or []}})
    leave = await leave_for_date(db, company_id(user), user["_id"], date)
    return serialize(row, leave)


@router.put("/status")
async def set_status(body: dict = Body(default={}), user=Depends(current_user)):
    status = str(body.get("status") or "").lower()
    if status not in ("working", "off"):
        fail(400, "Status must be working or off. Request leave from the Leave page.")
    date = today_in_zone(IST)
    db = get_db()
    leave = await leave_for_date(db, company_id(user), user["_id"], date)
    if leave.get("status") == "approved":
        fail(400, "Approved leave cannot be changed here")
    row = await get_or_create(db, company_id(user), user["_id"], date)
    row["status"] = status
    patch = {"status": status}
    if status != "working":
        close_open_break(row)
        row["startAt"] = None
        row["endAt"] = None
        row["breaks"] = []
        patch.update({"startAt": None, "endAt": None, "breaks": []})
    await db.attendances.update_one({"_id": row["_id"]}, {"$set": patch})
    return serialize(row, leave)


async def attendance_payload(date: str | None, user):
    if not can_see_all(user) and not is_team_lead(user):
        fail(403, "Attendance view is for admin, manager, or team lead")
    day = date or today_in_zone(IST)
    db = get_db()
    company = company_id(user)
    people = await db.users.find({"company": company}, {"username": 1, "role": 1, "avatar": 1}).sort("username", 1).to_list(500)
    if is_team_lead(user) and not can_see_all(user):
        members = await team_member_ids(db, user["_id"], company)
        allowed = {str(i) for i in members} | {str(user["_id"])}
        people = [p for p in people if str(p["_id"]) in allowed]
    ids = [p["_id"] for p in people]
    rows = await db.attendances.find({"company": company, "date": day, "user": {"$in": ids}}).to_list(500)
    leaves = await db.leaverequests.find({
        "company": company,
        "status": {"$in": ["approved", "pending"]},
        "startDate": {"$lte": day},
        "endDate": {"$gte": day},
        "user": {"$in": ids},
    }).to_list(500)
    leave_by = {}
    for item in leaves:
        key = str(item["user"])
        prev = leave_by.get(key)
        if not prev or item.get("status") == "approved":
            leave_by[key] = item
    by_user = {str(r["user"]): r for r in rows}
    return {
        "date": day,
        "people": dump([
            {
                "userId": person["_id"],
                "username": person.get("username"),
                "role": person.get("role"),
                "avatar": person.get("avatar") or "",
                "status": "leave" if leave_by.get(str(person["_id"]), {}).get("status") == "approved" else (by_user.get(str(person["_id"])) or {}).get("status") or "working",
                "startAt": (by_user.get(str(person["_id"])) or {}).get("startAt"),
                "endAt": (by_user.get(str(person["_id"])) or {}).get("endAt"),
                "onBreak": on_break(by_user.get(str(person["_id"]))),
                "hours": hours_between((by_user.get(str(person["_id"])) or {}).get("startAt"), (by_user.get(str(person["_id"])) or {}).get("endAt"), (by_user.get(str(person["_id"])) or {}).get("breaks")),
                "breakHours": break_hours((by_user.get(str(person["_id"])) or {}).get("breaks"), (by_user.get(str(person["_id"])) or {}).get("endAt")),
                "leaveStatus": (leave_by.get(str(person["_id"])) or {}).get("status"),
            }
            for person in people
        ]),
    }


def _csv_cell(value):
    text = "" if value is None else str(value)
    if any(ch in text for ch in ',\"\n'):
        return '"' + text.replace('"', '""') + '"'
    return text


@router.get("/")
async def list_attendance(date: str | None = Query(default=None), user=Depends(current_user)):
    return await attendance_payload(date, user)


@router.get("/export")
async def export_attendance(date: str | None = Query(default=None), user=Depends(current_user)):
    payload = await attendance_payload(date, user)
    lines = ["Person,Role,Status,Start,End,Break hours,Work hours"]
    for person in payload["people"]:
        status = "break" if person.get("onBreak") else (person.get("status") or "working")
        lines.append(",".join([
            _csv_cell(person.get("username")),
            _csv_cell(person.get("role")),
            _csv_cell(status),
            _csv_cell(format_ist(person.get("startAt")) if person.get("startAt") else ""),
            _csv_cell(format_ist(person.get("endAt")) if person.get("endAt") else ""),
            _csv_cell(person.get("breakHours") if person.get("breakHours") else "0"),
            _csv_cell("" if person.get("hours") is None else person.get("hours")),
        ]))
    day = payload["date"]
    body = "\n".join(lines) + "\n"
    return PlainTextResponse(
        body,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="attendance-{day}.csv"'},
    )
