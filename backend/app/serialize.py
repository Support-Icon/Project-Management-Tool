from datetime import date, datetime
from typing import Any

from bson import Binary, ObjectId
from bson.decimal128 import Decimal128


def oid(value: Any) -> ObjectId | None:
    if value is None or value == "":
        return None
    if isinstance(value, ObjectId):
        return value
    if isinstance(value, dict) and value.get("_id"):
        return oid(value["_id"])
    try:
        return ObjectId(str(value))
    except Exception:
        return None


def oid_str(value: Any) -> str:
    found = oid(value)
    return str(found) if found else str(value or "")


def dump(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, Binary):
        return bytes(value)
    if isinstance(value, Decimal128):
        return str(value)
    if isinstance(value, bytes):
        return value
    if isinstance(value, list):
        return [dump(item) for item in value]
    if isinstance(value, dict):
        return {key: dump(item) for key, item in value.items()}
    return value


def pick(doc: dict | None, fields: list[str]) -> dict | None:
    if not doc:
        return None
    out = {"_id": dump(doc.get("_id"))}
    for field in fields:
        if field in doc:
            out[field] = dump(doc[field])
    return out


async def map_by_id(collection, ids, fields: list[str] | None = None) -> dict[str, dict]:
    clean = [item for item in (oid(i) for i in ids) if item]
    if not clean:
        return {}
    projection = None
    if fields:
        projection = {field: 1 for field in fields}
        projection["_id"] = 1
    docs = await collection.find({"_id": {"$in": clean}}, projection).to_list(len(clean))
    return {str(doc["_id"]): dump(doc) for doc in docs}


async def attach(collection, docs: list[dict], field: str, keep: list[str]) -> None:
    ids = [doc.get(field) for doc in docs if doc.get(field)]
    lookup = await map_by_id(collection, ids, keep)
    for doc in docs:
        key = oid_str(doc.get(field)) if doc.get(field) else ""
        if key and key in lookup:
            src = lookup[key]
            doc[field] = {"_id": src.get("_id"), **{k: src.get(k) for k in keep}}
        elif doc.get(field):
            doc[field] = {"_id": dump(doc[field])}
