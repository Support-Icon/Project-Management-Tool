import httpx

from ..db import get_db
from ..encryption import decrypt
from ..serialize import oid

PROVIDER_DEFAULTS = {
    "groq": {"model": "llama-3.3-70b-versatile"},
    "openai": {"model": "gpt-4o-mini"},
    "gemini": {"model": "gemini-2.0-flash"},
    "claude": {"model": "claude-3-5-haiku-latest"},
}

LANGUAGE_NAMES = {
    "en": "English", "ta": "Tamil", "hi": "Hindi", "te": "Telugu",
    "kn": "Kannada", "ml": "Malayalam", "es": "Spanish", "fr": "French", "ar": "Arabic",
}


async def get_ai_config(company_id) -> dict:
    settings = await get_db().companysettings.find_one({"company": oid(company_id)})
    ai = (settings or {}).get("ai") or {}
    if not ai.get("enabled"):
        raise RuntimeError("AI assistant is disabled. Admin can enable it in Settings.")
    if not ai.get("apiKeyEncrypted"):
        raise RuntimeError("AI API key is missing. Admin must add it in Settings.")
    try:
        api_key = decrypt(ai["apiKeyEncrypted"])
    except Exception as exc:
        raise RuntimeError("Could not decrypt AI API key. Re-save the key in Settings.") from exc
    provider = ai.get("provider") or "groq"
    model = ai.get("model") or PROVIDER_DEFAULTS.get(provider, {}).get("model")
    return {"provider": provider, "model": model, "api_key": api_key, "temperature": ai.get("temperature", 0.2)}


def _content_text(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(part if isinstance(part, str) else part.get("text") or "" for part in content)
    return ""


async def chat_complete(company_id, messages: list[dict], tools: list[dict] | None = None) -> dict:
    cfg = await get_ai_config(company_id)
    provider = cfg["provider"]
    headers = {"Content-Type": "application/json"}
    payload = {"model": cfg["model"], "temperature": cfg["temperature"], "messages": messages}

    if provider in ("groq", "openai"):
        url = "https://api.groq.com/openai/v1/chat/completions" if provider == "groq" else "https://api.openai.com/v1/chat/completions"
        headers["Authorization"] = f"Bearer {cfg['api_key']}"
        if tools:
            payload["tools"] = tools
        async with httpx.AsyncClient(timeout=90) as client:
            res = await client.post(url, headers=headers, json=payload)
            res.raise_for_status()
            choice = res.json()["choices"][0]["message"]
            return choice

    if provider == "claude":
        headers["x-api-key"] = cfg["api_key"]
        headers["anthropic-version"] = "2023-06-01"
        system = " ".join(m["content"] for m in messages if m.get("role") == "system")
        claude_messages = [{"role": m["role"], "content": m["content"]} for m in messages if m.get("role") != "system"]
        body = {"model": cfg["model"], "max_tokens": 2048, "temperature": cfg["temperature"], "messages": claude_messages}
        if system:
            body["system"] = system
        async with httpx.AsyncClient(timeout=90) as client:
            res = await client.post("https://api.anthropic.com/v1/messages", headers=headers, json=body)
            res.raise_for_status()
            data = res.json()
            text = "".join(part.get("text") or "" for part in data.get("content") or [] if part.get("type") == "text")
            return {"role": "assistant", "content": text}

    if provider == "gemini":
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{cfg['model']}:generateContent"
        contents = []
        system = ""
        for msg in messages:
            if msg.get("role") == "system":
                system += msg.get("content") or ""
                continue
            role = "user" if msg.get("role") == "user" else "model"
            contents.append({"role": role, "parts": [{"text": msg.get("content") or ""}]})
        body = {"contents": contents, "generationConfig": {"temperature": cfg["temperature"]}}
        if system:
            body["systemInstruction"] = {"parts": [{"text": system}]}
        async with httpx.AsyncClient(timeout=90) as client:
            res = await client.post(url, params={"key": cfg["api_key"]}, json=body)
            res.raise_for_status()
            parts = (((res.json().get("candidates") or [{}])[0].get("content") or {}).get("parts") or [])
            text = "".join(p.get("text") or "" for p in parts)
            return {"role": "assistant", "content": text}

    raise RuntimeError(f"Unsupported AI provider: {provider}")


async def invoke_text(company_id, system: str, human: str) -> str:
    choice = await chat_complete(company_id, [
        {"role": "system", "content": system},
        {"role": "user", "content": human},
    ])
    return _content_text(choice.get("content")).strip()
