import base64
import re

from fastapi import APIRouter, Body, Depends
from pymongo import ReturnDocument

from ..db import get_db
from ..deps import company_id, current_user, fail, staff_user
from ..roles import ROLES, can_see_all, creatable_roles, is_admin, is_team_lead
from ..security import hash_password
from ..serialize import attach, dump, oid

router = APIRouter(prefix="/api/users", tags=["users"])
PUBLIC = ["username", "email", "role", "teamLead", "avatar", "createdAt"]
MAX_AVATAR = 10 * 1024


async def resolve_team_lead(db, team_lead_id, company, self_id=None):
    if not team_lead_id:
        return None
    if self_id and str(team_lead_id) == str(self_id):
        fail(400, "A user cannot be their own team lead")
    lead = await db.users.find_one({"_id": oid(team_lead_id), "company": company}, {"role": 1})
    if not lead:
        fail(400, "Team lead not found in your company")
    if lead.get("role") not in ("team_lead", "manager", "admin"):
        fail(400, "Selected user is not a team lead")
    return lead["_id"]


@router.get("/directory")
async def directory(user=Depends(current_user)):
    docs = await get_db().users.find(
        {"company": company_id(user)},
        {k: 1 for k in PUBLIC},
    ).sort("username", 1).to_list(500)
    return dump(docs)


@router.get("/assignable")
async def assignable(user=Depends(current_user)):
    from ..roles import can_assign_others
    db = get_db()
    if not can_assign_others(user):
        return [{"_id": dump(user["_id"]), "username": user["username"], "role": user["role"]}]
    filt = {"company": company_id(user)}
    if not can_see_all(user) and isinstance(user.get("scopeUserIds"), list):
        filt["_id"] = {"$in": user["scopeUserIds"]}
    docs = await db.users.find(filt, {k: 1 for k in PUBLIC}).sort("username", 1).to_list(500)
    return dump(docs)


@router.get("/")
async def list_users(user=Depends(staff_user)):
    db = get_db()
    filt = {"company": company_id(user)}
    if is_team_lead(user) and not can_see_all(user):
        filt["$or"] = [{"_id": user["_id"]}, {"teamLead": user["_id"]}]
    docs = await db.users.find(filt, {"password": 0}).sort("createdAt", 1).to_list(500)
    await attach(db.companies, docs, "company", ["name"])
    await attach(db.users, docs, "teamLead", ["username", "role"])
    return dump(docs)


@router.post("/")
async def create_user(body: dict = Body(default={}), user=Depends(staff_user)):
    username = str(body.get("username") or "").strip()
    password = str(body.get("password") or "")
    email = str(body.get("email") or "").strip().lower()
    role = body.get("role") or "member"
    if not username or not password or not email:
        fail(400, "Username, email and password required")
    if len(password) < 6:
        fail(400, "Password must be at least 6 characters")
    if role not in ROLES:
        fail(400, "Invalid role")
    if role not in creatable_roles(user):
        fail(403, f"You cannot create a {role} account")
    db = get_db()
    if await db.users.find_one({"username": username}):
        fail(400, "Username already taken")
    lead_id = body.get("teamLead")
    if is_team_lead(user) and role == "member":
        lead_id = user["_id"]
    lead = await resolve_team_lead(db, lead_id, company_id(user))
    from datetime import datetime, timezone
    doc = {
        "username": username,
        "email": email,
        "password": hash_password(password),
        "role": role,
        "teamLead": lead,
        "company": company_id(user),
        "avatar": "",
        "emailNotifications": True,
        "createdAt": datetime.now(timezone.utc),
    }
    result = await db.users.insert_one(doc)
    created = await db.users.find_one({"_id": result.inserted_id}, {"password": 0})
    docs = [created]
    await attach(db.companies, docs, "company", ["name"])
    await attach(db.users, docs, "teamLead", ["username", "role"])
    return dump(docs[0])


@router.put("/me/avatar")
async def set_avatar(body: dict = Body(default={}), user=Depends(current_user)):
    raw = str(body.get("avatar") or "")
    db = get_db()
    if not raw:
        await db.users.update_one({"_id": user["_id"]}, {"$set": {"avatar": ""}})
        return {"avatar": ""}
    match = re.match(r"^data:image/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=\s]+)$", raw, re.I)
    if not match:
        fail(400, "Use a JPG or PNG photo")
    blob = base64.b64decode(re.sub(r"\s+", "", match.group(2)))
    if len(blob) > MAX_AVATAR:
        fail(400, "Photo must be under 10 KB. Try a smaller crop.")
    mime = "jpeg" if match.group(1).lower() == "jpg" else match.group(1).lower()
    avatar = f"data:image/{mime};base64,{base64.b64encode(blob).decode()}"
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"avatar": avatar}})
    return {"avatar": avatar}


@router.put("/{user_id}")
async def update_user(user_id: str, body: dict = Body(default={}), user=Depends(staff_user)):
    db = get_db()
    updates = {}
    if body.get("username"):
        name = str(body["username"]).strip()
        conflict = await db.users.find_one({"username": name, "_id": {"$ne": oid(user_id)}})
        if conflict:
            fail(400, "Username already taken")
        updates["username"] = name
    if body.get("password"):
        if len(str(body["password"])) < 6:
            fail(400, "Password too short")
        updates["password"] = hash_password(str(body["password"]))
    if "email" in body:
        updates["email"] = str(body.get("email") or "").strip().lower()
    if "emailNotifications" in body:
        updates["emailNotifications"] = bool(body["emailNotifications"])
    if body.get("role"):
        role = body["role"]
        if role not in ROLES:
            fail(400, "Invalid role")
        if role not in creatable_roles(user) and user_id != str(user["_id"]):
            fail(403, f"You cannot assign the {role} role")
        if user_id == str(user["_id"]) and is_admin(user) and role != "admin":
            fail(400, "You cannot remove your own admin role")
        updates["role"] = role
    if "teamLead" in body:
        updates["teamLead"] = await resolve_team_lead(db, body.get("teamLead"), company_id(user), user_id)
    if not updates:
        target = await db.users.find_one({"_id": oid(user_id), "company": company_id(user)}, {"password": 0})
        if not target:
            fail(404, "User not found")
        return dump(target)
    result = await db.users.find_one_and_update(
        {"_id": oid(user_id), "company": company_id(user)},
        {"$set": updates},
        return_document=ReturnDocument.AFTER,
        projection={"password": 0},
    )
    if not result:
        fail(404, "User not found")
    if updates.get("role") == "member":
        await db.users.update_many({"teamLead": result["_id"]}, {"$set": {"teamLead": None}})
    docs = [result]
    await attach(db.companies, docs, "company", ["name"])
    await attach(db.users, docs, "teamLead", ["username", "role"])
    return dump(docs[0])


@router.delete("/{user_id}")
async def delete_user(user_id: str, user=Depends(staff_user)):
    if user_id == str(user["_id"]):
        fail(400, "You cannot delete yourself")
    db = get_db()
    existing = await db.users.find_one({"_id": oid(user_id), "company": company_id(user)})
    if not existing:
        fail(404, "User not found")
    if not can_see_all(user) and existing.get("role") == "admin":
        fail(403, "Only an admin or manager can remove an admin")
    if is_team_lead(user) and not can_see_all(user) and str(existing.get("teamLead") or "") != str(user["_id"]):
        fail(403, "You can only remove your own team members")
    await db.users.delete_one({"_id": existing["_id"]})
    await db.users.update_many({"teamLead": existing["_id"]}, {"$set": {"teamLead": None}})
    return {"message": "User deleted successfully"}
