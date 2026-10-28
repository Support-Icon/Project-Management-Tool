from typing import Annotated

from fastapi import Depends, Header, HTTPException

from .db import get_db
from .roles import can_manage_users, can_see_all, can_view_team_analytics, scope_user_ids
from .security import read_token, token_error
from .serialize import dump, oid


def fail(status: int, message: str):
    raise HTTPException(status_code=status, detail={"message": message})


async def load_user(db, user_id):
    user = await db.users.find_one({"_id": oid(user_id)})
    if not user:
        return None
    company = await db.companies.find_one({"_id": user.get("company")}) if user.get("company") else None
    user["company"] = {
        "_id": company["_id"] if company else user.get("company"),
        "name": company["name"] if company else "",
    }
    user["scopeUserIds"] = await scope_user_ids(db, user)
    return user


def _bearer(authorization: str | None, token: str | None) -> str:
    if authorization and authorization.lower().startswith("bearer "):
        return authorization.split(" ", 1)[1].strip()
    return (token or "").strip()


async def current_user(
    authorization: Annotated[str | None, Header()] = None,
    token: str | None = None,
):
    raw = _bearer(authorization, token)
    if not raw:
        fail(401, "No token provided")
    try:
        decoded = read_token(raw)
    except Exception as exc:
        fail(401, token_error(exc))
    if decoded.get("guest"):
        fail(403, "Guest access is only for that meeting")
    user = await load_user(get_db(), decoded.get("userId"))
    if not user:
        fail(401, "User not found")
    return user


async def current_user_or_guest(
    authorization: Annotated[str | None, Header()] = None,
    token: str | None = None,
):
    raw = _bearer(authorization, token)
    if not raw:
        fail(401, "No token provided")
    try:
        decoded = read_token(raw)
    except Exception as exc:
        fail(401, token_error(exc))
    if decoded.get("guest"):
        return {
            "_id": oid(decoded.get("guestId")) or decoded.get("guestId"),
            "username": decoded.get("name") or "Guest",
            "isGuest": True,
            "role": "guest",
            "company": {"_id": oid(decoded.get("companyId")) or decoded.get("companyId")},
            "guestMeetingId": decoded.get("meetingId"),
            "scopeUserIds": [decoded.get("guestId")],
            "avatar": "",
        }
    user = await load_user(get_db(), decoded.get("userId"))
    if not user:
        fail(401, "User not found")
    return user


def staff_user(user=Depends(current_user)):
    if not can_manage_users(user):
        fail(403, "Admin, manager or team lead access required")
    return user


def admin_user(user=Depends(current_user)):
    if not can_see_all(user):
        fail(403, "Admin or manager access required")
    return user


def leader_user(user=Depends(current_user)):
    if not can_view_team_analytics(user):
        fail(403, "Manager or team lead access required")
    return user


def company_id(user):
    company = user.get("company")
    return company.get("_id") if isinstance(company, dict) else company


def public_user(user: dict) -> dict:
    company = user.get("company") or {}
    return dump({
        "_id": user.get("_id"),
        "username": user.get("username"),
        "email": user.get("email") or "",
        "role": user.get("role"),
        "avatar": user.get("avatar") or "",
        "teamLead": user.get("teamLead"),
        "company": {"_id": company.get("_id"), "name": company.get("name")} if isinstance(company, dict) else company,
    })
