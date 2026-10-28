from datetime import datetime, timedelta, timezone

import bcrypt
from jose import JWTError, jwt

from .config import settings


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=10)).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def make_token(payload: dict, days: int = 30, hours: int | None = None) -> str:
    data = dict(payload)
    expire = datetime.now(timezone.utc) + (timedelta(hours=hours) if hours else timedelta(days=days))
    data["exp"] = expire
    return jwt.encode(data, settings.jwt_secret, algorithm="HS256")


def read_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])


def token_error(exc: Exception) -> str:
    if isinstance(exc, JWTError):
        return "Invalid or expired token"
    return str(exc)
