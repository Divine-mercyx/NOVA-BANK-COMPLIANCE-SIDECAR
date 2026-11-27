from datetime import datetime, timedelta, timezone
from secrets import token_urlsafe

import bcrypt
from jose import JWTError, jwt

from app.core.config import settings


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))


def generate_csrf_token() -> str:
    return token_urlsafe(32)


def create_access_token(user_id: str, email: str, role: str, csrf: str) -> str:
    """Session JWT. `csrf` binds the double-submit token to this session."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "csrf": csrf,
        "exp": expire,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
        raise ValueError("Invalid token") from exc


# token_urlsafe(8) is always 11 characters, and its alphabet (A-Z a-z 0-9 - _) includes "_".
# The key format therefore cannot be split on its first underscore: parse by this fixed length.
API_KEY_LOOKUP_LENGTH = 11
_API_KEY_PREFIX = "nova_"


def generate_api_key() -> tuple[str, str, str]:
    """Return (full_key, lookup_prefix, hash).

    Format: nova_{lookup}_{secret} — lookup is stored in DB for O(1) key resolution.
    `lookup` is exactly API_KEY_LOOKUP_LENGTH characters and may itself contain "_".
    """
    lookup = token_urlsafe(8)[:API_KEY_LOOKUP_LENGTH]
    secret = token_urlsafe(32)
    full_key = f"{_API_KEY_PREFIX}{lookup}_{secret}"
    key_hash = hash_api_key(full_key)
    return full_key, lookup, key_hash


def parse_api_key_lookup(raw: str) -> list[str]:
    """Return candidate DB key_prefix values for legacy and current key formats.

    Current format: nova_{11-char lookup}_{secret}. The lookup is cut by length, not at the first
    underscore, because the lookup can contain "_" (about 1 key in 6): splitting there looked such
    keys up under a shortened prefix and rejected them. Keys issued before this fix are parsed the
    same way, so they work again without being re-issued. Candidates are only used to find rows;
    the key is still verified against its hash.
    """
    key = (raw or "").strip()
    if not key.startswith(_API_KEY_PREFIX):
        return []
    body = key[len(_API_KEY_PREFIX):]
    if len(body) > API_KEY_LOOKUP_LENGTH and body[API_KEY_LOOKUP_LENGTH] == "_":
        return [body[:API_KEY_LOOKUP_LENGTH]]
    if "_" in body:
        # Not the fixed-length format: keep the old behaviour for any other key shape.
        return [body.split("_", 1)[0]]
    return [key[:12]]


def hash_api_key(api_key: str) -> str:
    return bcrypt.hashpw(api_key.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_api_key(api_key: str, key_hash: str) -> bool:
    return bcrypt.checkpw(api_key.encode("utf-8"), key_hash.encode("utf-8"))
