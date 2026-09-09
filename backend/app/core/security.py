from datetime import datetime, timedelta, timezone
from secrets import randbelow, token_urlsafe

import bcrypt
from jose import JWTError, jwt

from app.core.config import settings


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))


def generate_otp() -> str:
    return f"{randbelow(1_000_000):06d}"


def create_access_token(user_id: str, email: str, role: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": expire,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
        raise ValueError("Invalid token") from exc


def generate_api_key() -> tuple[str, str, str]:
    """Return (full_key, lookup_prefix, hash).

    Format: nova_{lookup}_{secret} — lookup is stored in DB for O(1) key resolution.
    """
    lookup = token_urlsafe(8)[:11]
    secret = token_urlsafe(32)
    full_key = f"nova_{lookup}_{secret}"
    key_hash = hash_api_key(full_key)
    return full_key, lookup, key_hash


def parse_api_key_lookup(raw: str) -> list[str]:
    """Return candidate DB key_prefix values for legacy and current key formats."""
    key = (raw or "").strip()
    if not key.startswith("nova_"):
        return []
    body = key[5:]
    if "_" in body:
        return [body.split("_", 1)[0]]
    return [key[:12]]


def hash_api_key(api_key: str) -> str:
    return bcrypt.hashpw(api_key.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_api_key(api_key: str, key_hash: str) -> bool:
    return bcrypt.checkpw(api_key.encode("utf-8"), key_hash.encode("utf-8"))
