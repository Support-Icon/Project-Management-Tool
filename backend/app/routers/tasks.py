from datetime import datetime, timezone

from fastapi import APIRouter, Body, Depends, Query
from pymongo import ReturnDocument

from ..db import get_db
from ..deps import company_id, current_user, fail
from ..duration import IST, compute_deadline, parse_duration, today_in_zone
from ..roles import can_assign_others, can_see_all, in_scope, task_filter_for_user
from ..serialize import attach, dump, oid
from ..services.notify import notify_task_assigned

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


async def timezone_for(db, company) -> str:
    settings = await db.companysettings.find_one({"company": company}, {"digest.timezone": 1})
    return ((settings or {}).get("digest") or {}).get("timezone") or IST


async def verify_project(db, project_id, company, user):
    project = await db.projects.find_one({"_id": oid(project_id), "company": company})
    if not project:
        return None
    if can_see_all(user):
        return project
    count = await db.tasks.count_documents({"project": project["_id"], **task_filter_for_user(user)})
    return project if count else None


async def validate_depends(db, depends_on, project_id, self_id=None):
    if not depends_on:
        return None
    if self_id and str(depends_on) == str(self_id):
        fail(400, "A task cannot depend on itself")
    dep = await db.tasks.find_one({"_id": oid(depends_on), "project": oid(project_id)})
    if not dep:
        fail(400, "Dependency task not found in this project")
    return dep["_id"]


async def unlock_dependents(db, completed_id):
    now = datetime.now(timezone.utc)
    await db.tasks.update_many(
        {"dependsOn": completed_id, "column": {"$ne": "done"}, "$or": [{"startDate": None}, {"startDate": {"$gt": now}}]},
        {"$set": {"startDate": now}},
    )


async def populate_task(db, task):
    docs = [task]
    await attach(db.users, docs, "assignee", ["username", "email", "emailNotifications", "avatar"])
    await attach(db.users, docs, "createdBy", ["username"])
    await attach(db.tasks, docs, "dependsOn", ["title", "column", "completedAt"])
    return dump(docs[0])


@router.get("/summary")
async def summary(mineOnly: str | None = Query(default=None), user=Depends(current_user)):
    db = get_db()
    project_ids = await db.projects.distinct("_id", {"company": company_id(user)})
    filt = {"project": {"$in": project_ids}, **task_filter_for_user(user, mineOnly)}
    total = await db.tasks.count_documents(filt)
    done = await db.tasks.count_documents({**filt, "column": "done"})
    return {"total": total, "done": done}


@router.post("/reorder")
async def reorder(body: dict = Body(default={}), user=Depends(current_user)):
    updates = body.get("updates")
    if not isinstance(updates, list) or not updates:
        fail(400, "updates array required")
    db = get_db()
    ids = [oid(u.get("_id")) for u in updates]
    tasks = await db.tasks.find({"_id": {"$in": ids}}).to_list(len(ids))
    if len(tasks) != len([i for i in ids if i]):
        fail(404, "One or more tasks not found")
    company = str(company_id(user))
    by_id = {str(t["_id"]): t for t in tasks}
    for task in tasks:
        project = await db.projects.find_one({"_id": task.get("project")}, {"company": 1})
        if not project or str(project.get("company")) != company:
            fail(403, "Access denied")
        if not in_scope(user, task.get("assignee")):
            fail(403, "You can only reorder your own tasks")
    for update in updates:
        task = by_id.get(str(update.get("_id")))
        if not task:
            continue
        column = update.get("column")
        if column and column not in ("todo", "done") and task.get("dependsOn"):
            dep = await db.tasks.find_one({"_id": task["dependsOn"]}, {"column": 1, "title": 1})
            if dep and dep.get("column") != "done":
                fail(400, f'Cannot start "{task.get("title")}" yet — waiting for "{dep.get("title")}" to complete.')
    newly = []
    for update in updates:
        before = by_id.get(str(update.get("_id")))
        column = update.get("column")
        await db.tasks.update_one({"_id": oid(update.get("_id"))}, {"$set": {
            "column": column,
            "order": update.get("order"),
            "completedAt": datetime.now(timezone.utc) if column == "done" else None,
        }})
        if before and before.get("column") != "done" and column == "done":
            newly.append(before["_id"])
    for completed in newly:
        await unlock_dependents(db, completed)
    return {"message": "Tasks reordered"}


@router.get("/{project_id}")
async def list_tasks(project_id: str, mineOnly: str | None = Query(default=None), user=Depends(current_user)):
    db = get_db()
    project = await verify_project(db, project_id, company_id(user), user)
    if not project:
        fail(404 if can_see_all(user) else 403, "Project not found" if can_see_all(user) else "You do not have access to this project")
    tasks = await db.tasks.find({"project": oid(project_id), **task_filter_for_user(user, mineOnly)}).sort("order", 1).to_list(1000)
    await attach(db.users, tasks, "assignee", ["username", "avatar"])
    await attach(db.users, tasks, "createdBy", ["username"])
    await attach(db.tasks, tasks, "dependsOn", ["title", "column", "completedAt"])
    day = today_in_zone(await timezone_for(db, company_id(user)))
    updated = {str(i) for i in await db.taskupdates.distinct("task", {
        "company": company_id(user),
        "updateDate": day,
        "task": {"$in": [t["_id"] for t in tasks]},
    })}
    out = []
    for task in dump(tasks):
        dep = task.get("dependsOn")
        waiting = bool(dep and isinstance(dep, dict) and dep.get("column") != "done" and task.get("column") != "done")
        task["hasTodayUpdate"] = str(task.get("_id")) in updated
        task["updateDate"] = day
        task["waitingOnPredecessor"] = waiting
        task["canStart"] = not waiting
        out.append(task)
    return out


@router.post("/")
async def create_task(body: dict = Body(default={}), user=Depends(current_user)):
    title = str(body.get("title") or "").strip()
    project_id = body.get("projectId")
    column = body.get("column")
    if not title or not project_id or not column:
        fail(400, "Title, projectId and column are required")
    db = get_db()
    project = await verify_project(db, project_id, company_id(user), user)
    if not project:
        fail(404 if can_see_all(user) else 403, "Project not found" if can_see_all(user) else "You do not have access to this project")
    assignee = body.get("assigneeId") if can_assign_others(user) else user["_id"]
    assignee_user = None
    if assignee:
        assignee_user = await db.users.find_one({"_id": oid(assignee), "company": company_id(user)})
        if not assignee_user:
            fail(400, "Assignee must belong to your company")
        if not in_scope(user, assignee_user["_id"]):
            fail(403, "You can only assign tasks to people in your team")
        assignee = assignee_user["_id"]
    dep = await validate_depends(db, body.get("dependsOn"), project_id)
    parsed = parse_duration(body.get("duration"))
    if parsed and parsed.get("error"):
        fail(400, parsed["error"])
    now = datetime.now(timezone.utc)
    start_date = datetime.fromisoformat(str(body["startDate"]).replace("Z", "+00:00")) if body.get("startDate") else None
    tz = await timezone_for(db, company_id(user))
    deadline_base = start_date if start_date and start_date > now else now
    deadline = compute_deadline(parsed, deadline_base, tz) if parsed else None
    max_task = await db.tasks.find_one({"project": oid(project_id), "column": column}, sort=[("order", -1)])
    order = (max_task.get("order") or 0) + 1 if max_task else 0
    due = body.get("dueDate") or deadline
    doc = {
        "title": title,
        "description": str(body.get("description") or "").strip(),
        "project": oid(project_id),
        "column": column,
        "order": order,
        "priority": body.get("priority") or "medium",
        "assignee": assignee,
        "assignedAt": now if assignee else None,
        "dueDate": due,
        "startDate": start_date,
        "duration": parsed or {"value": None, "unit": None},
        "deadlineAt": deadline,
        "dependsOn": dep,
        "tags": body.get("tags") or [],
        "createdBy": user["_id"],
        "completedAt": now if column == "done" else None,
        "createdAt": now,
    }
    result = await db.tasks.insert_one(doc)
    task = await db.tasks.find_one({"_id": result.inserted_id})
    populated = await populate_task(db, task)
    if assignee_user:
        await notify_task_assigned(db, company_id=company_id(user), assignee=assignee_user, task=task, project=project, assigned_by=user)
    return populated


@router.put("/{task_id}")
async def update_task(task_id: str, body: dict = Body(default={}), user=Depends(current_user)):
    db = get_db()
    task = await db.tasks.find_one({"_id": oid(task_id)})
    if not task:
        fail(404, "Task not found")
    project = await db.projects.find_one({"_id": task.get("project")}, {"company": 1, "title": 1})
    if not project or str(project.get("company")) != str(company_id(user)):
        fail(404, "Task not found")
    if not in_scope(user, task.get("assignee")):
        fail(403, "You can only edit your own tasks")
    updates = {}
    if "title" in body:
        updates["title"] = str(body.get("title") or "").strip()
    if "description" in body:
        updates["description"] = str(body.get("description") or "").strip()
    if "column" in body:
        updates["column"] = body["column"]
        if body["column"] != task.get("column"):
            updates["lastUpdateAt"] = datetime.now(timezone.utc)
        if body["column"] == "done" and task.get("column") != "done":
            updates["completedAt"] = datetime.now(timezone.utc)
        if body["column"] != "done" and task.get("column") == "done":
            updates["completedAt"] = None
    if "priority" in body:
        updates["priority"] = body["priority"]
    if "dueDate" in body:
        updates["dueDate"] = body.get("dueDate") or None
        if body.get("dueDate"):
            updates["deadlineAt"] = datetime.fromisoformat(str(body["dueDate"]).replace("Z", "+00:00")) if isinstance(body["dueDate"], str) else body["dueDate"]
    if "startDate" in body:
        updates["startDate"] = body.get("startDate") or None
    if "tags" in body:
        updates["tags"] = body["tags"]
    if "order" in body:
        updates["order"] = body["order"]
    if "dependsOn" in body:
        updates["dependsOn"] = await validate_depends(db, body.get("dependsOn"), task.get("project"), task["_id"])
    now = datetime.now(timezone.utc)
    assignee_changed = False
    if can_assign_others(user) and "assigneeId" in body:
        assignee_id = body.get("assigneeId")
        if assignee_id:
            valid = await db.users.find_one({"_id": oid(assignee_id), "company": company_id(user)})
            if not valid:
                fail(400, "Assignee must belong to your company")
            if not in_scope(user, valid["_id"]):
                fail(403, "You can only assign tasks to people in your team")
            updates["assignee"] = valid["_id"]
        else:
            updates["assignee"] = None
        assignee_changed = str(assignee_id or "") != str(task.get("assignee") or "")
        if assignee_changed and assignee_id:
            updates["assignedAt"] = now
    if "duration" in body:
        parsed = parse_duration(body.get("duration"))
        if parsed and parsed.get("error"):
            fail(400, parsed["error"])
        updates["duration"] = parsed or {"value": None, "unit": None}
    effective = updates.get("duration", task.get("duration") or {})
    duration_changed = "duration" in body and ((effective or {}).get("value") != (task.get("duration") or {}).get("value") or (effective or {}).get("unit") != (task.get("duration") or {}).get("unit"))
    if effective and effective.get("value") and "dueDate" not in body and (duration_changed or assignee_changed or not task.get("deadlineAt")):
        tz = await timezone_for(db, company_id(user))
        start = updates.get("startDate", task.get("startDate"))
        base = start if start and (start if isinstance(start, datetime) else datetime.now(timezone.utc)) > now else now
        if isinstance(start, str):
            try:
                parsed_start = datetime.fromisoformat(start.replace("Z", "+00:00"))
                if parsed_start > now:
                    base = parsed_start
            except ValueError:
                pass
        updates["deadlineAt"] = compute_deadline(effective, base, tz)
        updates["dueDate"] = updates["deadlineAt"]
    elif updates.get("duration") and not (updates["duration"] or {}).get("value"):
        updates["deadlineAt"] = None
    column = updates.get("column")
    if column and column not in ("todo", "done"):
        dep_id = updates.get("dependsOn", task.get("dependsOn"))
        if dep_id:
            dep = await db.tasks.find_one({"_id": oid(dep_id)}, {"column": 1, "title": 1})
            if dep and dep.get("column") != "done":
                fail(400, f'Cannot start yet — waiting for "{dep.get("title")}" to be completed first.')
    updated = await db.tasks.find_one_and_update({"_id": task["_id"]}, {"$set": updates} if updates else {"$set": {}}, return_document=ReturnDocument.AFTER)
    if column == "done" and task.get("column") != "done":
        await unlock_dependents(db, task["_id"])
    populated = await populate_task(db, updated)
    new_assignee = (populated.get("assignee") or {}).get("_id") if isinstance(populated.get("assignee"), dict) else populated.get("assignee")
    if new_assignee and str(new_assignee) != str(task.get("assignee") or ""):
        await notify_task_assigned(db, company_id=company_id(user), assignee=populated.get("assignee"), task=updated, project=project, assigned_by=user)
    return populated


@router.delete("/{task_id}")
async def delete_task(task_id: str, user=Depends(current_user)):
    db = get_db()
    task = await db.tasks.find_one({"_id": oid(task_id)})
    if not task:
        fail(404, "Task not found")
    project = await db.projects.find_one({"_id": task.get("project")}, {"company": 1})
    if not project or str(project.get("company")) != str(company_id(user)):
        fail(404, "Task not found")
    if not in_scope(user, task.get("assignee")):
        fail(403, "You can only delete your own tasks")
    await db.tasks.delete_one({"_id": task["_id"]})
    return {"message": "Task deleted successfully"}
