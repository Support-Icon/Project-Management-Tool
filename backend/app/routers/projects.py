from datetime import datetime, timezone

from fastapi import APIRouter, Body, Depends, Query
from pymongo import ReturnDocument

from ..db import get_db
from ..deps import admin_user, company_id, current_user, fail
from ..roles import can_see_all, task_filter_for_user
from ..serialize import attach, dump, oid

router = APIRouter(prefix="/api/projects", tags=["projects"])

DEFAULT_COLUMNS = [
    {"id": "todo", "title": "To Do", "color": "#6366f1", "order": 0},
    {"id": "inprogress", "title": "In Progress", "color": "#f59e0b", "order": 1},
    {"id": "review", "title": "Review", "color": "#8b5cf6", "order": 2},
    {"id": "done", "title": "Done", "color": "#10b981", "order": 3},
]


async def involved_project_ids(db, user, company):
    company_projects = await db.projects.find({"company": company}, {"_id": 1}).to_list(1000)
    ids = [p["_id"] for p in company_projects]
    if not ids:
        return []
    filt = {"project": {"$in": ids}, **task_filter_for_user(user)}
    return await db.tasks.distinct("project", filt)


async def can_access_project(db, user, project_id) -> bool:
    if can_see_all(user):
        return True
    count = await db.tasks.count_documents({"project": oid(project_id), **task_filter_for_user(user)})
    return count > 0


@router.get("/")
async def list_projects(mineOnly: str | None = Query(default=None), user=Depends(current_user)):
    db = get_db()
    company = company_id(user)
    filt = {"company": company}
    if not can_see_all(user) or mineOnly in ("true", "1"):
        filt["_id"] = {"$in": await involved_project_ids(db, user, company)}
    docs = await db.projects.find(filt, {"title": 1, "createdBy": 1, "createdAt": 1}).sort("createdAt", -1).to_list(500)
    await attach(db.users, docs, "createdBy", ["username"])
    return dump(docs)


@router.get("/{project_id}")
async def get_project(project_id: str, user=Depends(current_user)):
    db = get_db()
    project = await db.projects.find_one({"_id": oid(project_id), "company": company_id(user)})
    if not project:
        fail(404, "Project not found")
    if not await can_access_project(db, user, project["_id"]):
        fail(403, "You do not have access to this project")
    docs = [project]
    await attach(db.users, docs, "createdBy", ["username"])
    return dump(docs[0])


@router.post("/")
async def create_project(body: dict = Body(default={}), user=Depends(admin_user)):
    title = str(body.get("title") or "").strip()
    if not title:
        fail(400, "Title is required")
    db = get_db()
    doc = {
        "title": title,
        "description": str(body.get("description") or "").strip(),
        "company": company_id(user),
        "createdBy": user["_id"],
        "columns": DEFAULT_COLUMNS,
        "createdAt": datetime.now(timezone.utc),
    }
    result = await db.projects.insert_one(doc)
    created = await db.projects.find_one({"_id": result.inserted_id})
    docs = [created]
    await attach(db.users, docs, "createdBy", ["username"])
    return dump(docs[0])


@router.put("/{project_id}")
async def update_project(project_id: str, body: dict = Body(default={}), user=Depends(admin_user)):
    updates = {}
    if body.get("title"):
        updates["title"] = str(body["title"]).strip()
    if "description" in body:
        updates["description"] = str(body.get("description") or "").strip()
    if body.get("columns"):
        updates["columns"] = body["columns"]
    db = get_db()
    project = await db.projects.find_one_and_update(
        {"_id": oid(project_id), "company": company_id(user)},
        {"$set": updates} if updates else {"$set": {}},
        return_document=ReturnDocument.AFTER,
    )
    if not project:
        fail(404, "Project not found")
    docs = [project]
    await attach(db.users, docs, "createdBy", ["username"])
    return dump(docs[0])


@router.delete("/{project_id}")
async def delete_project(project_id: str, user=Depends(admin_user)):
    db = get_db()
    result = await db.projects.find_one_and_delete({"_id": oid(project_id), "company": company_id(user)})
    if not result:
        fail(404, "Project not found")
    await db.tasks.delete_many({"project": oid(project_id)})
    return {"message": "Project deleted successfully"}
