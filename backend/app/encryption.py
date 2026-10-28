import hashlib
import os
import re

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def _key() -> bytes:
    from .config import settings
    value = os.environ.get("ENCRYPTION_KEY") or settings.encryption_key or ""
    if not value:
        raise RuntimeError("ENCRYPTION_KEY is not configured")
    if re.fullmatch(r"[a-fA-F0-9]{64}", value):
        return bytes.fromhex(value)
    return hashlib.sha256(value.encode("utf-8")).digest()


def encrypt(plain_text: str) -> str:
    iv = os.urandom(12)
    aes = AESGCM(_key())
    packed = aes.encrypt(iv, plain_text.encode("utf-8"), None)
    tag, encrypted = packed[-16:], packed[:-16]
    return f"{iv.hex()}:{tag.hex()}:{encrypted.hex()}"


def decrypt(payload: str) -> str:
    parts = str(payload or "").split(":")
    if len(parts) != 3:
        raise ValueError("Invalid encrypted value")
    iv_hex, tag_hex, encrypted_hex = parts
    aes = AESGCM(_key())
    packed = bytes.fromhex(encrypted_hex) + bytes.fromhex(tag_hex)
    return aes.decrypt(bytes.fromhex(iv_hex), packed, None).decode("utf-8")
