from fastapi import APIRouter, Body, Depends

from ..deps import current_user, fail, public_user
from ..db import get_db
from ..security import make_token, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register")
async def register():
    fail(403, "Public signup is closed. Ask your admin to create your account.")


@router.post("/login")
async def login(body: dict = Body(default={})):
    username = str(body.get("username") or "").strip()
    password = str(body.get("password") or "")
    if not username or not password:
        fail(400, "Username and password required")
    db = get_db()
    user = await db.users.find_one({"username": username})
    if not user or not verify_password(password, user.get("password") or ""):
        fail(400, "Invalid credentials")
    company = await db.companies.find_one({"_id": user.get("company")}) if user.get("company") else None
    user["company"] = {"_id": company["_id"], "name": company.get("name")} if company else user.get("company")
    token = make_token({"userId": str(user["_id"])}, days=30)
    return {"token": token, "user": public_user(user)}


@router.get("/me")
async def me(user=Depends(current_user)):
    return public_user(user)
