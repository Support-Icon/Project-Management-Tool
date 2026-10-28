from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

IST = "Asia/Kolkata"
UNITS = ("minutes", "hours", "days")


def zone(name: str = IST) -> ZoneInfo:
    try:
        return ZoneInfo(name or IST)
    except Exception:
        return ZoneInfo(IST)


def now_tz(name: str = IST) -> datetime:
    return datetime.now(zone(name))


def today_in_zone(name: str = IST) -> str:
    return now_tz(name).date().isoformat()


def current_time_in_zone(name: str = IST) -> str:
    return now_tz(name).strftime("%H:%M")


def parse_duration(payload) -> dict | None:
    if not payload or payload.get("value") in ("", None):
        return None
    try:
        value = float(payload.get("value"))
    except (TypeError, ValueError):
        return {"error": "Duration must be a positive number"}
    unit = payload.get("unit") if payload.get("unit") in UNITS else "hours"
    if value <= 0:
        return {"error": "Duration must be a positive number"}
    if value > 100000:
        return {"error": "Duration is too large"}
    return {"value": value if value != int(value) else int(value), "unit": unit}


def compute_deadline(duration: dict | None, from_dt: datetime | None = None, timezone_name: str = IST):
    if not duration or not duration.get("value"):
        return None
    base = from_dt or datetime.now(timezone.utc)
    if base.tzinfo is None:
        base = base.replace(tzinfo=timezone.utc)
    local = base.astimezone(zone(timezone_name))
    value = duration["value"]
    unit = duration.get("unit") or "hours"
    if unit == "minutes":
        local = local + timedelta(minutes=value)
    elif unit == "days":
        local = local + timedelta(days=value)
    else:
        local = local + timedelta(hours=value)
    return local.astimezone(timezone.utc)


def format_duration(duration: dict | None) -> str:
    if not duration or not duration.get("value"):
        return ""
    unit = duration.get("unit") or "hours"
    if duration["value"] == 1:
        unit = unit.rstrip("s")
    return f"{duration['value']} {unit}"


def format_ist(value, timezone_name: str = IST) -> str:
    if not value:
        return "Not set"
    if isinstance(value, str):
        value = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    local = value.astimezone(zone(timezone_name))
    label = "IST" if timezone_name == IST else (local.tzname() or "")
    stamp = local.strftime("%d %b %Y, %I:%M %p")
    if stamp.startswith("0"):
        stamp = stamp[1:]
    return f"{stamp} {label}".strip()
