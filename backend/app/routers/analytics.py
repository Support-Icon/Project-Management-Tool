from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query

from ..db import get_db
from ..deps import company_id, current_user, leader_user
from ..duration import IST, today_in_zone
from ..roles import can_see_all
from ..serialize import dump, oid

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


async def context(db, company, days_param):
    settings = await db.companysettings.find_one({"company": company}, {"digest.timezone": 1})
    tz_name = ((settings or {}).get("digest") or {}).get("timezone") or IST
    days = min(max(int(days_param or 7), 1), 90)
    today = today_in_zone(tz_name)
    start = datetime.fromisoformat(today) - timedelta(days=days - 1)
    dates = [(start + timedelta(days=i)).date().isoformat() for i in range(days)]
    project_ids = await db.projects.distinct("_id", {"company": company})
    return tz_name, today, dates, project_ids


async def scoped_users(db, user):
    company = company_id(user)
    if can_see_all(user):
        return await db.users.find({"company": company}, {"username": 1, "email": 1, "role": 1}).to_list(500)
    if isinstance(user.get("scopeUserIds"), list):
        return await db.users.find({"company": company, "_id": {"$in": user["scopeUserIds"]}}, {"username": 1, "email": 1, "role": 1}).to_list(500)
    return await db.users.find({"_id": user["_id"]}, {"username": 1, "email": 1, "role": 1}).to_list(5)


def person_stats(person, open_tasks, updates, today, dates):
    uid = str(person["_id"])
    assigned = [t for t in open_tasks if str(t.get("assignee")) == uid]
    mine = [u for u in updates if str(u.get("author")) == uid]
    today_ids = {str(u.get("task")) for u in mine if u.get("updateDate") == today}
    missing = len([t for t in assigned if str(t["_id"]) not in today_ids])
    days_updated = len({u.get("updateDate") for u in mine})
    return {
        "_id": person["_id"],
        "username": person.get("username"),
        "email": person.get("email"),
        "role": person.get("role"),
        "assignedOpen": len(assigned),
        "updatesToday": len([u for u in mine if u.get("updateDate") == today]),
        "missingToday": missing,
        "updatesInPeriod": len(mine),
        "compliancePercent": round((days_updated / max(len(dates), 1)) * 100),
        "blockerCount": len([u for u in mine if u.get("blockers")]),
    }


@router.get("/overview")
async def overview(days: int = Query(default=7), user=Depends(leader_user)):
    db = get_db()
    company = company_id(user)
    tz_name, today, dates, project_ids = await context(db, company, days)
    users = await scoped_users(db, user)
    user_ids = [u["_id"] for u in users]
    assignee_filter = {"assignee": {"$ne": None}} if can_see_all(user) else {"assignee": {"$in": user_ids}}
    open_tasks = await db.tasks.find({"project": {"$in": project_ids}, **assignee_filter, "column": "inprogress"}, {"assignee": 1}).to_list(2000)
    upd_filter = {"company": company, "updateDate": {"$in": dates}}
    if not can_see_all(user):
        upd_filter["author"] = {"$in": user_ids}
    updates = await db.taskupdates.find(upd_filter, {"author": 1, "task": 1, "updateDate": 1, "progressPercent": 1, "blockers": 1}).to_list(5000)
    updates_today = [u for u in updates if u.get("updateDate") == today]
    updated_set = {str(u.get("task")) for u in updates_today}
    missing = len([t for t in open_tasks if str(t["_id"]) not in updated_set])
    start_dt = datetime.fromisoformat(dates[0]).replace(tzinfo=timezone.utc)
    completed_filter = {"project": {"$in": project_ids}, "completedAt": {"$gte": start_dt}}
    if not can_see_all(user):
        completed_filter["assignee"] = {"$in": user_ids}
    completed = await db.tasks.count_documents(completed_filter)
    people = [person_stats(u, open_tasks, updates, today, dates) for u in users]
    pipeline_match = {"project": {"$in": project_ids}}
    if not can_see_all(user):
        pipeline_match["assignee"] = {"$in": user_ids}
    status_counts = await db.tasks.aggregate([{"$match": pipeline_match}, {"$group": {"_id": "$column", "count": {"$sum": 1}}}]).to_list(20)
    status = {"todo": 0, "inprogress": 0, "review": 0, "done": 0}
    for row in status_counts:
        if row.get("_id"):
            status[row["_id"]] = row["count"]
    trend = [{"date": d, "updates": len([u for u in updates if u.get("updateDate") == d]), "completed": 0, "created": 0} for d in dates]
    return dump({
        "timezone": tz_name,
        "period": {"start": dates[0], "end": dates[-1], "days": len(dates)},
        "summary": {
            "openTasks": len(open_tasks),
            "updatesToday": len(updates_today),
            "missingToday": missing,
            "completedInPeriod": completed,
            "activePeople": len([p for p in people if p["assignedOpen"] > 0]),
        },
        "people": people,
        "charts": {"trend": trend, "status": status},
    })


@router.get("/personal")
async def personal(days: int = Query(default=7), user=Depends(current_user)):
    db = get_db()
    tz_name, today, dates, project_ids = await context(db, company_id(user), days)
    open_tasks = await db.tasks.find({"project": {"$in": project_ids}, "assignee": user["_id"], "column": "inprogress"}).to_list(200)
    updates = await db.taskupdates.find({"company": company_id(user), "author": user["_id"], "updateDate": {"$in": dates}}).to_list(500)
    stats = person_stats(user, open_tasks, updates, today, dates)
    return dump({"timezone": tz_name, "period": {"start": dates[0], "end": dates[-1], "days": len(dates)}, "person": stats, "openTasks": open_tasks, "updates": updates})


@router.get("/daily-updates")
async def daily_updates(days: int = Query(default=7), user=Depends(leader_user)):
    db = get_db()
    tz_name, today, dates, project_ids = await context(db, company_id(user), days)
    filt = {"company": company_id(user), "updateDate": {"$in": dates}}
    if not can_see_all(user) and isinstance(user.get("scopeUserIds"), list):
        filt["author"] = {"$in": user["scopeUserIds"]}
    docs = await db.taskupdates.find(filt).sort("updateDate", -1).to_list(400)
    from ..serialize import attach
    await attach(db.users, docs, "author", ["username"])
    await attach(db.tasks, docs, "task", ["title", "column"])
    return dump(docs)


@router.get("/today-work")
async def today_work(user=Depends(leader_user)):
    db = get_db()
    company = company_id(user)
    tz_name, today, dates, project_ids = await context(db, company, 1)
    people = await scoped_users(db, user)
    ids = [p["_id"] for p in people]
    tasks = await db.tasks.find({"project": {"$in": project_ids}, "assignee": {"$in": ids}, "column": {"$ne": "done"}}).to_list(1000)
    updates = await db.taskupdates.find({"company": company, "updateDate": today, "author": {"$in": ids}}).to_list(1000)
    by_author = {}
    for item in updates:
        by_author.setdefault(str(item.get("author")), []).append(item)
    rows = []
    for person in people:
        assigned = [t for t in tasks if str(t.get("assignee")) == str(person["_id"])]
        rows.append(dump({
            "_id": person["_id"],
            "username": person.get("username"),
            "role": person.get("role"),
            "openTasks": len(assigned),
            "updatedToday": len(by_author.get(str(person["_id"]), [])),
            "tasks": assigned[:12],
        }))
    return {"date": today, "timezone": tz_name, "people": rows}
