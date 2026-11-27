"""Seals a small secret (a person's authenticator key) before it is stored in the database.

AES-256-GCM: the stored text is unreadable and tamper-evident without the key. The key is TWO_FACTOR_KEY when
set (recommended: 32 random bytes as hex or base64, kept outside the database), otherwise derived from the
session signing secret so a fresh install still works. Changing the key makes every stored authenticator key
unreadable: each person then sets up their authenticator app again.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import re
from secrets import token_bytes

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes

from app.core.config import settings

_PREFIX = "v1:"


class SecretBoxError(Exception):
    """The stored secret cannot be opened (wrong key, or the text was changed)."""


def _configured_key() -> bytes:
    raw = (settings.two_factor_key or "").strip()
    if raw:
        if re.fullmatch(r"[0-9a-fA-F]{64}", raw):
            return bytes.fromhex(raw)
        try:
            decoded = base64.b64decode(raw, validate=True)
        except ValueError:
            decoded = b""
        if len(decoded) == 32:
            return decoded
        # Any other text: stretch it to 32 bytes rather than refuse to start.
        return hashlib.sha256(raw.encode("utf-8")).digest()
    return HKDF(algorithm=hashes.SHA256(), length=32, salt=None, info=b"nova-two-factor-v1").derive(
        settings.jwt_secret.encode("utf-8")
    )


def seal(plain: str) -> str:
    nonce = token_bytes(12)
    sealed = AESGCM(_configured_key()).encrypt(nonce, plain.encode("utf-8"), None)
    return _PREFIX + base64.urlsafe_b64encode(nonce + sealed).decode("ascii")


def open_sealed(stored: str) -> str:
    if not stored.startswith(_PREFIX):
        raise SecretBoxError("Unknown format")
    try:
        raw = base64.urlsafe_b64decode(stored[len(_PREFIX) :])
        return AESGCM(_configured_key()).decrypt(raw[:12], raw[12:], None).decode("utf-8")
    except (InvalidTag, ValueError) as exc:
        raise SecretBoxError("Cannot open the stored secret") from exc


def recovery_hash(code: str) -> str:
    """Recovery codes are random and long, so a keyed hash is enough: nothing to guess without the key."""
    normalised = re.sub(r"[\s-]", "", code).upper()
    return hmac.new(_configured_key(), b"recovery:" + normalised.encode("utf-8"), hashlib.sha256).hexdigest()
