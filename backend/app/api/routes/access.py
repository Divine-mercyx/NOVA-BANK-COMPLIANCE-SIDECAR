"""Roles and the permission catalogue (role-based access control)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.core.database import get_db
from app.core.permissions import ALL_PERMISSIONS, catalogue_payload, normalize
from app.models.entities import AuditEvent, Role, User
from app.schemas.auth import PermissionOut, RoleCreate, RoleOut, RoleUpdate
from app.services.access import (
    assert_access_admin_remains,
    assert_can_grant,
    clean_permissions,
    role_user_counts,
)

router = APIRouter(prefix="/api/v1/access", tags=["access"], dependencies=[Depends(get_current_user)])


def _role_out(role: Role, counts: dict[str, int]) -> RoleOut:
    return RoleOut(
        id=role.id,
        name=role.name,
        description=role.description,
        permissions=sorted(ALL_PERMISSIONS) if role.all_permissions else normalize(role.permissions),
        system_key=role.system_key,
        all_permissions=role.all_permissions,
        user_count=counts.get(role.id, 0),
    )


async def _get_role(db: AsyncSession, role_id: str) -> Role:
    role = (await db.execute(select(Role).where(Role.id == role_id))).scalar_one_or_none()
    if not role:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Role not found")
    return role


async def _name_taken(db: AsyncSession, name: str, exclude_id: str | None = None) -> bool:
    stmt = select(Role.id).where(func.lower(Role.name) == name.strip().lower())
    if exclude_id:
        stmt = stmt.where(Role.id != exclude_id)
    return (await db.execute(stmt)).first() is not None


@router.get("/permissions", response_model=list[PermissionOut])
async def list_permissions():
    """Every permission the portal checks, grouped for display. Not sensitive: any signed-in user may read it."""
    return catalogue_payload()


@router.get(
    "/roles",
    response_model=list[RoleOut],
    dependencies=[Depends(require_permission("roles.manage", "team.manage", "team.view"))],
)
async def list_roles(db: AsyncSession = Depends(get_db)):
    roles = (await db.execute(select(Role).order_by(Role.system_key.is_(None), Role.name))).scalars().all()
    counts = await role_user_counts(db)
    return [_role_out(r, counts) for r in roles]


@router.post("/roles", response_model=RoleOut, status_code=status.HTTP_201_CREATED)
async def create_role(
    body: RoleCreate,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_permission("roles.manage")),
):
    name = body.name.strip()
    if await _name_taken(db, name):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A role with this name already exists")
    permissions = clean_permissions(body.permissions)
    assert_can_grant(actor, permissions)

    role = Role(name=name, description=(body.description or "").strip() or None, permissions=permissions)
    db.add(role)
    await db.flush()
    db.add(
        AuditEvent(
            actor_id=actor.id,
            actor_name=actor.full_name,
            action="ROLE_CREATED",
            entity_type="role",
            entity_id=role.id,
            details={"name": role.name, "permissions": permissions},
        )
    )
    await db.commit()
    return _role_out(role, {})


@router.patch("/roles/{role_id}", response_model=RoleOut)
async def update_role(
    role_id: str,
    body: RoleUpdate,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_permission("roles.manage")),
):
    role = await _get_role(db, role_id)
    before = {"name": role.name, "permissions": normalize(role.permissions)}

    if body.name is not None:
        name = body.name.strip()
        if role.all_permissions and name != role.name:
            raise HTTPException(status.HTTP_409_CONFLICT, "The Admin role cannot be renamed")
        if await _name_taken(db, name, exclude_id=role.id):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "A role with this name already exists")
        role.name = name
    if body.description is not None:
        role.description = body.description.strip() or None
    if body.permissions is not None:
        if role.all_permissions:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "The Admin role always has every permission. Make a new role for narrower access.",
            )
        permissions = clean_permissions(body.permissions)
        assert_can_grant(actor, set(permissions) - set(role.permissions or []))
        role.permissions = permissions

    await db.flush()
    await assert_access_admin_remains(db)
    db.add(
        AuditEvent(
            actor_id=actor.id,
            actor_name=actor.full_name,
            action="ROLE_UPDATED",
            entity_type="role",
            entity_id=role.id,
            details={"before": before, "after": {"name": role.name, "permissions": normalize(role.permissions)}},
        )
    )
    await db.commit()
    return _role_out(role, await role_user_counts(db))


@router.delete("/roles/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_role(
    role_id: str,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_permission("roles.manage")),
):
    role = await _get_role(db, role_id)
    if role.system_key:
        raise HTTPException(status.HTTP_409_CONFLICT, "Built-in roles cannot be deleted")
    assigned = (await db.execute(select(func.count()).select_from(User).where(User.role_id == role.id))).scalar_one()
    if assigned:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"{assigned} staff member(s) still have this role (including removed staff). Move them to another role first.",
        )
    await db.delete(role)
    db.add(
        AuditEvent(
            actor_id=actor.id,
            actor_name=actor.full_name,
            action="ROLE_DELETED",
            entity_type="role",
            entity_id=role_id,
            details={"name": role.name},
        )
    )
    await db.commit()
    return None
