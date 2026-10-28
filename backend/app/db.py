from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from .config import settings

client: AsyncIOMotorClient | None = None
db: AsyncIOMotorDatabase | None = None


async def connect() -> None:
    global client, db
    if not settings.mongodb_uri:
        raise RuntimeError("MONGODB_URI is not set")
    client = AsyncIOMotorClient(settings.mongodb_uri)
    db = client.get_default_database()
    if db is None or db.name in ("", "test"):
        db = client["projectflow"]


async def close() -> None:
    global client
    if client is not None:
        client.close()
        client = None


def get_db() -> AsyncIOMotorDatabase:
    if db is None:
        raise RuntimeError("Database is not connected")
    return db
