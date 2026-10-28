from datetime import datetime, timezone

from fastapi import APIRouter, Body, Depends
from pymongo import ReturnDocument

from ..db import get_db
from ..deps import company_id, current_user, fail
from ..duration import IST, today_in_zone
from ..roles import in_scope
from ..serialize import attach, dump, oid

router = APIRouter(prefix="/api/task-updates", tags=["task-updates"])


async def today(db, company) -> str:
    settings = await db.companysettings.find_one({"company": company}, {"digest.timezone": 1})
    return today_in_zone(((settings or {}).get("digest") or {}).get("timezone") or IST)


async def load_task(db, task_id, company):
    task = await db.tasks.find_one({"_id": oid(task_id)})
    if not task:
        return None
    project = await db.projects.find_one({"_id": task.get("project")}, {"company": 1, "title": 1})
    if not project or str(project.get("company")) != str(company):
        return None
    task["project"] = project
    if task.get("assignee"):
        task["assignee"] = await db.users.find_one({"_id": task["assignee"]}, {"username": 1, "email": 1}) or task["assignee"]
    return task


@router.get("/pending/mine")
async def pending_mine(user=Depends(current_user)):
    db = get_db()
    company = company_id(user)
    day = await today(db, company)
    tasks = await db.tasks.find({"assignee": user["_id"], "column": "inprogress"}).to_list(200)
    project_ids = list({t["project"] for t in tasks if t.get("project")})
    projects = {str(p["_id"]): p for p in await db.projects.find({"_id": {"$in": project_ids}, "company": company}, {"title": 1, "company": 1}).to_list(200)}
    company_tasks = [t for t in tasks if str(t.get("project")) in projects]
    updated_ids = await db.taskupdates.distinct("task", {
        "company": company,
        "author": user["_id"],
        "updateDate": day,
        "task": {"$in": [t["_id"] for t in company_tasks]},
    })
    updated = {str(i) for i in updated_ids}
    return dump({
        "date": day,
        "tasks": [
            {
                "_id": t["_id"],
                "title": t.get("title"),
                "project": projects[str(t["project"])],
                "priority": t.get("priority"),
                "dueDate": t.get("dueDate"),
                "column": t.get("column"),
            }
            for t in company_tasks if str(t["_id"]) not in updated
        ],
    })


@router.get("/{task_id}")
async def list_updates(task_id: str, user=Depends(current_user)):
    db = get_db()
    task = await load_task(db, task_id, company_id(user))
    if not task:
        fail(404, "Task not found")
    assignee = task.get("assignee")
    if not in_scope(user, assignee.get("_id") if isinstance(assignee, dict) else assignee):
        fail(403, "You cannot view updates for this task")
    updates = await db.taskupdates.find({"task": task["_id"], "company": company_id(user)}).sort("updateDate", -1).to_list(200)
    await attach(db.users, updates, "author", ["username"])
    return dump({"taskStatus": task.get("column"), "today": await today(db, company_id(user)), "updates": updates})


@router.post("/{task_id}")
async def add_update(task_id: str, body: dict = Body(default={}), user=Depends(current_user)):
    db = get_db()
    task = await load_task(db, task_id, company_id(user))
    if not task:
        fail(404, "Task not found")
    assignee = task.get("assignee")
    assignee_id = assignee.get("_id") if isinstance(assignee, dict) else assignee
    if not assignee_id or str(assignee_id) != str(user["_id"]):
        fail(403, "Only the assigned person can add a daily update")
    if task.get("column") != "inprogress":
        fail(400, "Daily updates are only for In Progress tasks. Move the task to In Progress first.")
    content = str(body.get("content") or "").strip()
    if not content:
        fail(400, "Daily update is required")
    day = await today(db, company_id(user))
    update = await db.taskupdates.find_one_and_update(
        {"task": task["_id"], "updateDate": day},
        {"$set": {
            "company": company_id(user),
            "author": user["_id"],
            "content": content,
            "progressPercent": float(body.get("progressPercent") or 0),
            "blockers": str(body.get("blockers") or "").strip(),
            "nextPlan": str(body.get("nextPlan") or "").strip(),
            "createdAt": datetime.now(timezone.utc),
        }},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    await db.tasks.update_one({"_id": task["_id"]}, {"$set": {"lastUpdateAt": datetime.now(timezone.utc)}})
    docs = [update]
    await attach(db.users, docs, "author", ["username"])
    return dump(docs[0])
