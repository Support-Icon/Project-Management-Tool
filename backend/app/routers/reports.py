from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from fastapi.responses import PlainTextResponse

from ..db import get_db
from ..deps import admin_user, company_id, current_user
from ..serialize import dump, oid

router = APIRouter(prefix="/api/reports", tags=["reports"])


def csv_response(name: str, headers: list[str], rows: list[list]):
    lines = [",".join(headers)]
    for row in rows:
        cells = []
        for cell in row:
            text = "" if cell is None else str(cell)
            if any(ch in text for ch in ',\"\n'):
                text = '"' + text.replace('"', '""') + '"'
            cells.append(text)
        lines.append(",".join(cells))
    body = "\n".join(lines) + "\n"
    return PlainTextResponse(body, media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{name}"'})


def period_range(period: str | None, start: str | None, end: str | None):
    now = datetime.now(timezone.utc)
    if start and end:
        return datetime.fromisoformat(start), datetime.fromisoformat(end) + timedelta(days=1)
    days = {"week": 7, "month": 30, "quarter": 90}.get(period or "month", 30)
    return now - timedelta(days=days), now


@router.get("/users")
async def users_report(period: str | None = Query(default=None), start: str | None = Query(default=None), end: str | None = Query(default=None), user=Depends(admin_user)):
    db = get_db()
    company = company_id(user)
    begin, finish = period_range(period, start, end)
    users = await db.users.find({"company": company}, {"password": 0}).sort("createdAt", 1).to_list(500)
    project_ids = await db.projects.distinct("_id", {"company": company})
    rows = []
    for person in users:
        base = {"project": {"$in": project_ids}, "assignee": person["_id"], "createdAt": {"$gte": begin, "$lt": finish}}
        assigned = await db.tasks.count_documents(base)
        completed = await db.tasks.count_documents({**base, "column": "done"})
        in_progress = await db.tasks.count_documents({**base, "column": "inprogress"})
        created = await db.tasks.count_documents({"project": {"$in": project_ids}, "createdBy": person["_id"], "createdAt": {"$gte": begin, "$lt": finish}})
        rows.append([person.get("username"), person.get("role"), str(person.get("createdAt") or "")[:10], assigned, completed, in_progress, created])
    return csv_response("users-report.csv", ["Username", "Role", "Joined", "Tasks Assigned", "Tasks Completed", "In Progress", "Tasks Created"], rows)


@router.get("/projects")
async def projects_report(period: str | None = Query(default=None), start: str | None = Query(default=None), end: str | None = Query(default=None), user=Depends(admin_user)):
    db = get_db()
    begin, finish = period_range(period, start, end)
    projects = await db.projects.find({"company": company_id(user)}).to_list(200)
    rows = []
    for project in projects:
        total = await db.tasks.count_documents({"project": project["_id"], "createdAt": {"$gte": begin, "$lt": finish}})
        done = await db.tasks.count_documents({"project": project["_id"], "column": "done", "createdAt": {"$gte": begin, "$lt": finish}})
        rows.append([project.get("title"), total, done, total - done])
    return csv_response("projects-report.csv", ["Project", "Tasks", "Completed", "Open"], rows)


@router.get("/user/{user_id}")
async def user_report(user_id: str, period: str | None = Query(default=None), start: str | None = Query(default=None), end: str | None = Query(default=None), user=Depends(current_user)):
    db = get_db()
    begin, finish = period_range(period, start, end)
    project_ids = await db.projects.distinct("_id", {"company": company_id(user)})
    tasks = await db.tasks.find({"project": {"$in": project_ids}, "assignee": oid(user_id), "createdAt": {"$gte": begin, "$lt": finish}}).to_list(500)
    rows = [[t.get("title"), t.get("column"), t.get("priority"), str(t.get("dueDate") or "")] for t in tasks]
    return csv_response("user-report.csv", ["Title", "Column", "Priority", "Due"], rows)


@router.get("/project/{project_id}")
async def project_report(project_id: str, period: str | None = Query(default=None), start: str | None = Query(default=None), end: str | None = Query(default=None), user=Depends(current_user)):
    begin, finish = period_range(period, start, end)
    tasks = await get_db().tasks.find({"project": oid(project_id), "createdAt": {"$gte": begin, "$lt": finish}}).to_list(1000)
    rows = [[t.get("title"), t.get("column"), t.get("priority"), str(t.get("assignee") or "")] for t in tasks]
    return csv_response("project-report.csv", ["Title", "Column", "Priority", "Assignee"], rows)
