import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_roles
from app.core.config import settings
from app.core.database import get_db
from app.core.security import create_access_token, generate_otp, hash_password, verify_password
from app.models.entities import AuditEvent, OtpSession, User, UserRole
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

    logger.warning("OTP for %s (%s): %s", user.full_name, user.email, code)
    print(f"\n{'=' * 48}\nNOVA OTP for {user.email}: {code}\nExpires in {settings.otp_expire_minutes} minutes\n{'=' * 48}\n")

    return LoginResponse(
        otp_session_id=session.id,
        message="OTP generated. Check the backend console during development.",
    )


@router.post("/verify-otp", response_model=AuthResponse)
async def verify_otp(body: VerifyOtpRequest, db: AsyncSession = Depends(get_db)):
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

    token = create_access_token(user.id, user.email, user.role.value)
    return AuthResponse(access_token=token, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return UserOut.model_validate(user)


@router.post("/staff", response_model=UserOut)
async def create_staff(
    body: CreateStaffRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_roles(UserRole.ADMIN)),
):
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(400, "Email already registered")

    staff = User(
        email=body.email,
        full_name=body.full_name,
        role=body.role,
        password_hash=hash_password(body.password),
        is_active=True,
    )
    db.add(staff)
    await db.flush()

    db.add(
        AuditEvent(
            actor_id=admin.id,
            actor_name=admin.full_name,
            action="STAFF_CREATED",
            entity_type="user",
            entity_id=staff.id,
            details={"email": staff.email, "role": staff.role.value},
        )
    )
    await db.commit()
    await db.refresh(staff)
    return UserOut.model_validate(staff)


async def _get_user_or_404(db: AsyncSession, user_id: str) -> User:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, "User not found")
    return user


async def _admin_count(db: AsyncSession) -> int:
    result = await db.execute(
        select(func.count())
        .select_from(User)
        .where(User.role == UserRole.ADMIN, User.is_active.is_(True))
    )
    return result.scalar_one() or 0


@router.patch("/staff/{user_id}", response_model=UserOut)
async def update_staff(
    user_id: str,
    body: UpdateStaffRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_roles(UserRole.ADMIN)),
):
    user = await _get_user_or_404(db, user_id)

    if body.email and body.email != user.email:
        existing = await db.execute(select(User).where(User.email == body.email))
        if existing.scalar_one_or_none():
            raise HTTPException(400, "Email already registered")
        user.email = body.email

    if body.full_name is not None:
        user.full_name = body.full_name
    if body.role is not None:
        if user.role == UserRole.ADMIN and body.role != UserRole.ADMIN:
            if user.id == admin.id:
                raise HTTPException(400, "You cannot demote your own admin account")
            if await _admin_count(db) <= 1:
                raise HTTPException(400, "Cannot demote the last active admin")
        user.role = body.role
    if body.is_active is not None:
        if user.id == admin.id and not body.is_active:
            raise HTTPException(400, "You cannot deactivate your own account")
        if user.role == UserRole.ADMIN and not body.is_active and await _admin_count(db) <= 1:
            raise HTTPException(400, "Cannot deactivate the last active admin")
        user.is_active = body.is_active
    if body.password:
        user.password_hash = hash_password(body.password)

    db.add(
        AuditEvent(
            actor_id=admin.id,
            actor_name=admin.full_name,
            action="STAFF_UPDATED",
            entity_type="user",
            entity_id=user.id,
            details={"email": user.email, "role": user.role.value, "is_active": user.is_active},
        )
    )
    await db.commit()
    await db.refresh(user)
    return UserOut.model_validate(user)


@router.delete("/staff/{user_id}", response_model=UserOut)
async def remove_staff(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_roles(UserRole.ADMIN)),
):
    user = await _get_user_or_404(db, user_id)

    if user.id == admin.id:
        raise HTTPException(400, "You cannot remove your own account")
    if user.role == UserRole.ADMIN and await _admin_count(db) <= 1:
        raise HTTPException(400, "Cannot remove the last active admin")

    user.is_active = False

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
    await db.refresh(user)
    return UserOut.model_validate(user)

