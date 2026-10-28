from urllib.parse import urlparse

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    mongodb_uri: str = ""
    jwt_secret: str = "change-me"
    port: int = 5000
    frontend_url: str = "http://localhost:5173"
    allowed_origins: str = ""
    encryption_key: str = ""
    cron_secret: str = ""
    aws_region: str = "ap-south-1"


settings = Settings()


def normalize_origin(url: str) -> str:
    if not url:
        return ""
    try:
        parsed = urlparse(url.strip())
        if parsed.scheme and parsed.netloc:
            return f"{parsed.scheme}://{parsed.netloc}"
    except Exception:
        pass
    return url.strip().rstrip("/")


def allowed_origins() -> list[str]:
    raw = settings.allowed_origins or settings.frontend_url or ""
    items = [normalize_origin(part) for part in raw.split(",")]
    return [item for item in dict.fromkeys(items) if item]
