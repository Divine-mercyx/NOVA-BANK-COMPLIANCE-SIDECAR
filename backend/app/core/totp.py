"""Time-based one-time passwords (RFC 6238): the six-digit codes that Google Authenticator, Microsoft
Authenticator, 1Password and Authy show.

HMAC-SHA1, 30-second steps, six digits: the defaults every authenticator app reads from an otpauth:// link.
Pure functions (no database, no clock of their own) so they can be tested against the RFC's published vectors.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import re
import struct
from secrets import token_bytes
from urllib.parse import quote, urlencode

STEP_SECONDS = 30
DIGITS = 6
# One step either side: a phone clock that is a little off, or a code typed just as it changes.
DRIFT_STEPS = 1

_CODE = re.compile(r"^\d{6}$")


def new_secret() -> str:
    """A new secret: 160 random bits, as RFC 4226 recommends, in base32 (the form authenticator apps take)."""
    return base64.b32encode(token_bytes(20)).decode("ascii").rstrip("=")


def _key(secret: str) -> bytes:
    """Decodes base32, ignoring case, spaces, dashes and padding, as people copy the key by hand."""
    clean = re.sub(r"[\s=-]", "", secret).upper()
    clean += "=" * (-len(clean) % 8)
    return base64.b32decode(clean)


def step_at(unix_seconds: float) -> int:
    return int(unix_seconds // STEP_SECONDS)


def code_at(secret: str, step: int) -> str:
    """The code for one time step."""
    mac = hmac.new(_key(secret), struct.pack(">Q", step), hashlib.sha1).digest()
    offset = mac[-1] & 0x0F
    binary = struct.unpack(">I", mac[offset : offset + 4])[0] & 0x7FFFFFFF
    return str(binary % 10**DIGITS).zfill(DIGITS)


def verify(secret: str, code: str, now: float, last_used_step: int | None = None) -> int | None:
    """The time step a code belongs to, or None.

    A step at or before `last_used_step` is refused, so a code someone watched being typed cannot be used again
    inside the same half-minute.
    """
    digits = re.sub(r"\s", "", code or "")
    if not _CODE.match(digits):
        return None
    current = step_at(now)
    match: int | None = None
    # Compare every step, so the time taken does not say which one matched.
    for step in range(current - DRIFT_STEPS, current + DRIFT_STEPS + 1):
        equal = hmac.compare_digest(code_at(secret, step), digits)
        if equal and (last_used_step is None or step > last_used_step):
            match = step
    return match


def otpauth_url(secret: str, account: str, issuer: str) -> str:
    """The link an authenticator app reads from a QR code."""
    label = f"{quote(issuer, safe='')}:{quote(account, safe='')}"
    params = urlencode({"secret": secret, "issuer": issuer, "algorithm": "SHA1", "digits": DIGITS, "period": STEP_SECONDS})
    return f"otpauth://totp/{label}?{params}"
