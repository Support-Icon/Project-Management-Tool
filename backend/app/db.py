from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from .config import settings

client: AsyncIOMotorClient | None = None
db: AsyncIOMotorDatabase | None = None


def _pick_database(mongo_client: AsyncIOMotorClient) -> AsyncIOMotorDatabase:
    try:
        found = mongo_client.get_default_database()
    except Exception:
        found = None
    if found is None or not found.name:
        return mongo_client["test"]
    return found


async def connect() -> None:
    global client, db
    if not settings.mongodb_uri:
        raise RuntimeError("MONGODB_URI is not set")
    client = AsyncIOMotorClient(
        settings.mongodb_uri,
        serverSelectionTimeoutMS=8000,
        tz_aware=True,
    )
    db = _pick_database(client)


async def close() -> None:
    global client, db
    if client is not None:
        client.close()
    client = None
    db = None


def get_db() -> AsyncIOMotorDatabase:
    if db is None:
        raise RuntimeError("Database is not connected")
    return db
