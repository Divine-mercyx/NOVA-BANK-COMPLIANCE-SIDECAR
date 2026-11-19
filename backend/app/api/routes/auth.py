import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.core.config import settings
from app.core.database import get_db
from app.core.security import create_access_token, generate_csrf_token, generate_otp, hash_password, verify_password
from app.models.entities import AuditEvent, OtpSession, Role, User, UserRole
from app.services.access import (
    assert_access_admin_remains,
    assert_can_grant,
    assert_can_manage,
    clean_permissions,
    load_role,
    load_user,
)
from app.schemas.auth import (
    AuthResponse,
    CreateStaffRequest,
    LoginRequest,
    LoginResponse,
    UpdateStaffRequest,
    VerifyOtpRequest,
)
from app.schemas.compliance import UserOut

logger = logging.getLogger("nova.auth")
router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


def _set_session_cookies(response: Response, token: str, csrf: str) -> None:
    max_age = settings.jwt_expire_minutes * 60
    secure = settings.cookies_secure
    response.set_cookie(
        settings.session_cookie_name,
        token,
        max_age=max_age,
        httponly=True,
        secure=secure,
        samesite="strict",
        path="/api",
    )
    response.set_cookie(
        settings.csrf_cookie_name,
        csrf,
        max_age=max_age,
        httponly=False,
        secure=secure,
        samesite="strict",
        path="/",
    )


def _clear_session_cookies(response: Response) -> None:
    secure = settings.cookies_secure
    response.delete_cookie(settings.session_cookie_name, path="/api", secure=secure, httponly=True, samesite="strict")
    response.delete_cookie(settings.csrf_cookie_name, path="/", secure=secure, samesite="strict")


@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if not user or not user.password_hash or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Invalid email or password")
    if not user.is_active:
        raise HTTPException(403, "Account is inactive")

    code = generate_otp()
    session = OtpSession(
        user_id=user.id,
        code=code,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=settings.otp_expire_minutes),
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    if settings.debug:
        print(f"\n{'=' * 48}\nNOVA OTP for {user.email}: {code}\nExpires in {settings.otp_expire_minutes} minutes\n{'=' * 48}\n")

    return LoginResponse(
        otp_session_id=session.id,
        message="OTP generated. Check the backend console during development.",
    )


@router.post("/verify-otp", response_model=AuthResponse)
async def verify_otp(body: VerifyOtpRequest, response: Response, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(OtpSession).where(OtpSession.id == body.otp_session_id))
    session = result.scalar_one_or_none()
    if not session or session.used:
        raise HTTPException(400, "Invalid OTP session")
    if session.expires_at < datetime.now(timezone.utc):
        raise HTTPException(400, "OTP expired")
    if session.code != body.code:
        raise HTTPException(400, "Invalid OTP code")

    session.used = True
    user_result = await db.execute(select(User).where(User.id == session.user_id))
    user = user_result.scalar_one()

    db.add(
        AuditEvent(
            actor_id=user.id,
            actor_name=user.full_name,
            action="LOGIN_SUCCESS",
            entity_type="user",
            entity_id=user.id,
        )
    )
    await db.commit()

    csrf = generate_csrf_token()
    token = create_access_token(user.id, user.email, user.role.value, csrf)
    _set_session_cookies(response, token, csrf)
    return AuthResponse(user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return UserOut.model_validate(user)


@router.post("/logout", status_code=204)
async def logout(response: Response, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    db.add(
        AuditEvent(
            actor_id=user.id,
            actor_name=user.full_name,
            action="LOGOUT",
            entity_type="user",
            entity_id=user.id,
        )
    )
    await db.commit()
    _clear_session_cookies(response)
    return None


def _legacy_role(role: Role) -> UserRole:
    """The old fixed-role column, kept filled for older clients. Access never comes from it."""
    try:
        return UserRole(role.system_key) if role.system_key else UserRole.VIEWER
    except ValueError:
        return UserRole.VIEWER


def _access_summary(user: User) -> dict:
    return {
        "email": user.email,
        "role": user.access_role.name if user.access_role else None,
        "extra_permissions": list(user.extra_permissions or []),
        "revoked_permissions": list(user.revoked_permissions or []),
        "is_active": user.is_active,
    }


@router.post("/staff", response_model=UserOut)
async def create_staff(
    body: CreateStaffRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_permission("team.manage")),
):
    existing = await db.execute(select(User).where(func.lower(User.email) == body.email.lower()))
    if existing.unique().scalar_one_or_none():
        raise HTTPException(400, "Email already registered")

    role = await load_role(db, body.role_id)
    extra = clean_permissions(body.extra_permissions)
    revoked = [p for p in clean_permissions(body.revoked_permissions) if p not in extra]

    staff = User(
        email=body.email,
        full_name=body.full_name.strip(),
        role=_legacy_role(role),
        role_id=role.id,
        extra_permissions=extra,
        revoked_permissions=revoked,
        password_hash=hash_password(body.password),
        is_active=True,
    )
    db.add(staff)
    await db.flush()
    staff = await load_user(db, staff.id)
    assert_can_grant(admin, staff.permissions)

    db.add(
        AuditEvent(
            actor_id=admin.id,
            actor_name=admin.full_name,
            action="STAFF_CREATED",
            entity_type="user",
            entity_id=staff.id,
            details=_access_summary(staff),
        )
    )
    await db.commit()
    return UserOut.model_validate(await load_user(db, staff.id))


@router.patch("/staff/{user_id}", response_model=UserOut)
async def update_staff(
    user_id: str,
    body: UpdateStaffRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_permission("team.manage")),
):
    user = await load_user(db, user_id)
    before = _access_summary(user)
    changes_access = (
        body.role_id is not None
        or body.extra_permissions is not None
        or body.revoked_permissions is not None
        or body.is_active is not None
    )
    if changes_access and user.id == admin.id:
        raise HTTPException(400, "You cannot change your own role, permissions or status. Ask another administrator.")
    assert_can_manage(admin, user)

    if body.email and body.email.lower() != user.email.lower():
        existing = await db.execute(select(User).where(func.lower(User.email) == body.email.lower()))
        if existing.unique().scalar_one_or_none():
            raise HTTPException(400, "Email already registered")
        user.email = body.email

    if body.full_name is not None:
        user.full_name = body.full_name.strip()
    if body.role_id is not None:
        role = await load_role(db, body.role_id)
        user.role_id = role.id
        user.role = _legacy_role(role)
    if body.extra_permissions is not None:
        user.extra_permissions = clean_permissions(body.extra_permissions)
    if body.revoked_permissions is not None:
        user.revoked_permissions = clean_permissions(body.revoked_permissions)
    # A permission cannot be both added and removed: adding wins.
    user.revoked_permissions = [p for p in (user.revoked_permissions or []) if p not in set(user.extra_permissions or [])]
    if body.is_active is not None:
        user.is_active = body.is_active
    if body.password:
        user.password_hash = hash_password(body.password)

    await db.flush()
    user = await load_user(db, user.id)
    if changes_access:
        assert_can_grant(admin, user.permissions)
        await assert_access_admin_remains(db)

    after = _access_summary(user)
    db.add(
        AuditEvent(
            actor_id=admin.id,
            actor_name=admin.full_name,
            action="STAFF_PERMISSIONS_UPDATED" if before != after and changes_access else "STAFF_UPDATED",
            entity_type="user",
            entity_id=user.id,
            details={"before": before, "after": after},
        )
    )
    await db.commit()
    return UserOut.model_validate(await load_user(db, user.id))


@router.delete("/staff/{user_id}", response_model=UserOut)
async def remove_staff(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_permission("team.manage")),
):
    user = await load_user(db, user_id)

    if user.id == admin.id:
        raise HTTPException(400, "You cannot remove your own account")
    assert_can_manage(admin, user)

    user.is_active = False
    await db.flush()
    await assert_access_admin_remains(db)

    db.add(
        AuditEvent(
            actor_id=admin.id,
            actor_name=admin.full_name,
            action="STAFF_REMOVED",
            entity_type="user",
            entity_id=user.id,
            details={"email": user.email},
        )
    )
    await db.commit()
    return UserOut.model_validate(await load_user(db, user.id))
