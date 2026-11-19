import hmac

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.entities import User

SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})
CSRF_HEADER = "x-csrf-token"


async def user_from_session_token(token: str | None, db: AsyncSession) -> tuple[User, dict] | None:
    """Resolve an active user from a session JWT, or None when it is missing, invalid or expired."""
    if not token:
        return None
    try:
        payload = decode_access_token(token)
    except ValueError:
        return None
    result = await db.execute(select(User).where(User.id == payload.get("sub")))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        return None
    return user, payload


async def get_current_user(request: Request, db: AsyncSession = Depends(get_db)) -> User:
    """Staff session from the httpOnly cookie. State-changing requests must also echo the
    session's CSRF token in the X-CSRF-Token header (double submit, bound to the JWT)."""
    token = request.cookies.get(settings.session_cookie_name)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Authentication required")
    resolved = await user_from_session_token(token, db)
    if not resolved:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired or invalid")
    user, payload = resolved

    if request.method not in SAFE_METHODS:
        sent = request.headers.get(CSRF_HEADER, "")
        expected = payload.get("csrf", "")
        if not sent or not expected or not hmac.compare_digest(sent, expected):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "CSRF token missing or invalid")
    return user


def require_permission(*permissions: str):
    """Allow the request if the signed-in user holds any of `permissions` (see app/core/permissions.py).

    Permissions are read from the user's current role and per-staff lists on every request, so a change
    takes effect immediately, without waiting for the session to expire."""
    from app.core.permissions import ALL_PERMISSIONS

    unknown = set(permissions) - ALL_PERMISSIONS
    if unknown or not permissions:
        raise ValueError(f"Unknown permission(s): {sorted(unknown)}")

    async def checker(user: User = Depends(get_current_user)) -> User:
        held = user.permissions
        if not any(p in held for p in permissions):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not have access to this. Ask an administrator.")
        return user

    return checker
