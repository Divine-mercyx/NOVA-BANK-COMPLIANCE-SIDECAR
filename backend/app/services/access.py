"""Rules for changing who can do what: shared by the staff and role endpoints."""

from __future__ import annotations

from typing import Iterable

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import ACCESS_ADMIN_PERMISSIONS, normalize, unknown
from app.models.entities import Role, User


async def load_user(db: AsyncSession, user_id: str) -> User:
    """A user with their role loaded, reflecting any change already flushed in this transaction."""
    result = await db.execute(
        select(User).where(User.id == user_id).execution_options(populate_existing=True)
    )
    user = result.unique().scalar_one_or_none()
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return user


async def load_role(db: AsyncSession, role_id: str) -> Role:
    result = await db.execute(select(Role).where(Role.id == role_id))
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Role not found")
    return role


def clean_permissions(keys: Iterable[str] | None) -> list[str]:
    """Known permission keys, in catalogue order. An unknown key is an error, not silently dropped."""
    bad = unknown(keys)
    if bad:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown permission(s): {', '.join(bad)}")
    return normalize(keys)


def assert_can_grant(actor: User, permissions: Iterable[str]) -> None:
    """Nobody hands out access they do not have themselves (so a delegated team manager cannot escalate)."""
    missing = sorted(set(permissions) - actor.permissions)
    if missing:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            f"You can only give access you have yourself. You do not have: {', '.join(missing)}",
        )


def assert_can_manage(actor: User, target: User) -> None:
    """You cannot change the access of someone who can do more than you."""
    beyond = sorted(target.permissions - actor.permissions)
    if beyond:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "This person has access you do not have, so you cannot change their account.",
        )


async def assert_access_admin_remains(db: AsyncSession) -> None:
    """At least one active user must still be able to manage both the team and roles, or nobody could ever
    fix access again. Call after flushing the change, before committing."""
    result = await db.execute(
        select(User).where(User.is_active.is_(True)).execution_options(populate_existing=True)
    )
    for user in result.unique().scalars():
        if ACCESS_ADMIN_PERMISSIONS <= user.permissions:
            return
    raise HTTPException(
        status.HTTP_409_CONFLICT,
        "This would leave nobody able to manage the team and roles. Give someone else that access first.",
    )


async def role_user_counts(db: AsyncSession) -> dict[str, int]:
    result = await db.execute(
        select(User.role_id, func.count()).where(User.is_active.is_(True)).group_by(User.role_id)
    )
    return {role_id: count for role_id, count in result.all() if role_id}
