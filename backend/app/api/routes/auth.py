import logging
import time
from datetime import datetime, timedelta, timezone
from secrets import token_bytes

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.core.config import settings
from app.core.database import get_db
from app.core import totp
from app.core.secret_box import SecretBoxError, open_sealed, recovery_hash, seal
from app.core.security import create_access_token, generate_csrf_token, hash_password, verify_password
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
    RecoveryCodesResponse,
    RegenerateRecoveryCodesRequest,
    TwoFactorEnableRequest,
    TwoFactorEnableResponse,
    TwoFactorSetupRequest,
    TwoFactorSetupResponse,
    TwoFactorStatus,
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


def _now() -> float:
    """The clock the codes are checked against. One place, so tests can move it."""
    return time.time()


RECOVERY_CODE_COUNT = 10
_RECOVERY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # no 0/O, 1/I/L: easy to read out and type


def _new_recovery_codes() -> list[str]:
    """Ten codes like K7M2P-9XQ4D-HT3WA (75 random bits each)."""
    codes = []
    for _ in range(RECOVERY_CODE_COUNT):
        raw = "".join(_RECOVERY_ALPHABET[b % len(_RECOVERY_ALPHABET)] for b in token_bytes(15))
        codes.append(f"{raw[0:5]}-{raw[5:10]}-{raw[10:15]}")
    return codes


def _audit(db: AsyncSession, user: User, action: str, *, actor: User | None = None, details: dict | None = None) -> None:
    who = actor or user
    db.add(
        AuditEvent(
            actor_id=who.id,
            actor_name=who.full_name,
            action=action,
            entity_type="user",
            entity_id=user.id,
            details=details,
        )
    )


def _start_session(response: Response, user: User) -> None:
    csrf = generate_csrf_token()
    token = create_access_token(user.id, user.email, user.role.value, csrf)
    _set_session_cookies(response, token, csrf)


async def _load_challenge(db: AsyncSession, otp_session_id: str, purpose: str) -> OtpSession:
    """A sign-in challenge that is still open: not used, not expired, not out of tries, and of the right kind."""
    session = (await db.execute(select(OtpSession).where(OtpSession.id == otp_session_id))).scalar_one_or_none()
    if not session or session.used or session.purpose != purpose:
        raise HTTPException(400, "Invalid sign-in session. Please sign in again.")
    if session.expires_at < datetime.now(timezone.utc):
        raise HTTPException(400, "This sign-in has expired. Please sign in again.")
    if session.attempts >= settings.two_factor_max_attempts:
        session.used = True
        await db.commit()
        raise HTTPException(400, "Too many wrong codes. Please sign in again.")
    return session


async def _user_of(db: AsyncSession, session: OtpSession) -> User:
    user = (await db.execute(select(User).where(User.id == session.user_id))).unique().scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(403, "Account is inactive")
    return user


async def _wrong_code(db: AsyncSession, session: OtpSession, user: User) -> HTTPException:
    """Count the wrong try (kept even though the request fails) and say the same thing whatever went wrong."""
    session.attempts += 1
    left = settings.two_factor_max_attempts - session.attempts
    if left <= 0:
        session.used = True
        _audit(db, user, "TWO_FACTOR_LOCKED_OUT", details={"reason": "too many wrong codes"})
    await db.commit()
    if left <= 0:
        return HTTPException(400, "Too many wrong codes. Please sign in again.")
    return HTTPException(400, "Invalid code")


def _open_secret(user: User, sealed: str | None) -> str:
    if not sealed:
        raise HTTPException(400, "Two-factor sign-in is not set up for this account")
    try:
        return open_sealed(sealed)
    except SecretBoxError:
        # The key changed or the stored text is damaged: an administrator has to reset it.
        logger.error("Cannot open the authenticator key for user %s; it needs a reset", user.id)
        raise HTTPException(400, "Your authenticator setup cannot be read. Ask an administrator to reset it.")


@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Step one: email and password. The second step is the code from the person's authenticator app.

    Someone who has not connected an authenticator app yet is taken through setup first, so no account can be
    used with a password alone.
    """
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.unique().scalar_one_or_none()
    if not user or not user.password_hash or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Invalid email or password")
    if not user.is_active:
        raise HTTPException(403, "Account is inactive")

    purpose = "verify" if user.totp_enabled and user.totp_secret else "setup"
    minutes = settings.two_factor_challenge_minutes if purpose == "verify" else settings.two_factor_setup_minutes
    session = OtpSession(
        user_id=user.id,
        purpose=purpose,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=minutes),
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    return LoginResponse(
        otp_session_id=session.id,
        two_factor=purpose,
        message=(
            "Enter the 6-digit code from your authenticator app."
            if purpose == "verify"
            else "Connect an authenticator app to finish signing in."
        ),
    )


@router.post("/verify-otp", response_model=AuthResponse)
async def verify_otp(body: VerifyOtpRequest, response: Response, db: AsyncSession = Depends(get_db)):
    """Step two: the six-digit code from the authenticator app, or one recovery code."""
    session = await _load_challenge(db, body.otp_session_id, "verify")
    user = await _user_of(db, session)

    if body.code:
        secret = _open_secret(user, user.totp_secret)
        step = totp.verify(secret, body.code, _now(), user.totp_last_step)
        if step is None:
            raise await _wrong_code(db, session, user)
        # Only later steps are accepted from now on: this code cannot be used a second time.
        user.totp_last_step = step
        used_recovery = False
    else:
        digest = recovery_hash(body.recovery_code or "")
        hashes = list(user.recovery_code_hashes or [])
        if digest not in hashes:
            raise await _wrong_code(db, session, user)
        hashes.remove(digest)  # each recovery code works once
        user.recovery_code_hashes = hashes
        used_recovery = True
        _audit(db, user, "TWO_FACTOR_RECOVERY_USED", details={"recovery_codes_left": len(hashes)})

    session.used = True
    _audit(db, user, "LOGIN_SUCCESS", details={"method": "recovery_code" if used_recovery else "authenticator_app"})
    await db.commit()

    _start_session(response, user)
    return AuthResponse(user=UserOut.model_validate(user))


@router.post("/2fa/setup", response_model=TwoFactorSetupResponse)
async def two_factor_setup(body: TwoFactorSetupRequest, db: AsyncSession = Depends(get_db)):
    """First sign-in: the key and QR link to add to the authenticator app.

    The same pending key comes back until it is confirmed, so loading the page twice (or in two tabs) never
    shows a QR code that does not match what is stored.
    """
    session = await _load_challenge(db, body.otp_session_id, "setup")
    user = await _user_of(db, session)
    if user.totp_enabled:
        raise HTTPException(400, "An authenticator app is already connected. Sign in again.")

    if user.totp_pending_secret:
        secret = _open_secret(user, user.totp_pending_secret)
    else:
        secret = totp.new_secret()
        user.totp_pending_secret = seal(secret)
        await db.commit()
    return TwoFactorSetupResponse(
        secret=secret,
        otpauth_url=totp.otpauth_url(secret, user.email, settings.two_factor_issuer),
        issuer=settings.two_factor_issuer,
        account=user.email,
    )


@router.post("/2fa/enable", response_model=TwoFactorEnableResponse)
async def two_factor_enable(body: TwoFactorEnableRequest, response: Response, db: AsyncSession = Depends(get_db)):
    """First sign-in: the person types a code from the app to prove it works. Then they are signed in and shown
    their recovery codes (once)."""
    session = await _load_challenge(db, body.otp_session_id, "setup")
    user = await _user_of(db, session)
    if user.totp_enabled:
        raise HTTPException(400, "An authenticator app is already connected. Sign in again.")

    secret = _open_secret(user, user.totp_pending_secret)
    step = totp.verify(secret, body.code, _now(), None)
    if step is None:
        raise await _wrong_code(db, session, user)

    codes = _new_recovery_codes()
    user.totp_secret = user.totp_pending_secret
    user.totp_pending_secret = None
    user.totp_enabled = True
    user.totp_enabled_at = datetime.now(timezone.utc)
    user.totp_last_step = step
    user.recovery_code_hashes = [recovery_hash(c) for c in codes]
    session.used = True
    _audit(db, user, "TWO_FACTOR_ENABLED")
    _audit(db, user, "LOGIN_SUCCESS", details={"method": "authenticator_app_setup"})
    await db.commit()

    _start_session(response, user)
    return TwoFactorEnableResponse(user=UserOut.model_validate(user), recovery_codes=codes)


@router.get("/2fa", response_model=TwoFactorStatus)
async def two_factor_status(user: User = Depends(get_current_user)):
    return TwoFactorStatus(
        enabled=bool(user.totp_enabled),
        recovery_codes_left=len(user.recovery_code_hashes or []),
        enabled_at=user.totp_enabled_at,
    )


@router.post("/2fa/recovery-codes", response_model=RecoveryCodesResponse)
async def regenerate_recovery_codes(
    body: RegenerateRecoveryCodesRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """New recovery codes (the old ones stop working). Needs a current code from the app."""
    secret = _open_secret(user, user.totp_secret)
    step = totp.verify(secret, body.code, _now(), user.totp_last_step)
    if step is None:
        raise HTTPException(400, "Invalid code")
    codes = _new_recovery_codes()
    user.totp_last_step = step
    user.recovery_code_hashes = [recovery_hash(c) for c in codes]
    _audit(db, user, "TWO_FACTOR_RECOVERY_CODES_REPLACED")
    await db.commit()
    return RecoveryCodesResponse(recovery_codes=codes)


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


@router.post("/staff/{user_id}/two-factor-reset", response_model=UserOut)
async def reset_two_factor(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_permission("team.manage")),
):
    """For a lost or replaced phone with no recovery codes left. Clears the person's authenticator app; they
    set up a new one the next time they sign in (their password is still needed)."""
    user = await load_user(db, user_id)
    if user.id == admin.id:
        raise HTTPException(400, "You cannot reset your own two-factor sign-in. Ask another administrator.")
    assert_can_manage(admin, user)

    user.totp_secret = None
    user.totp_pending_secret = None
    user.totp_enabled = False
    user.totp_enabled_at = None
    user.totp_last_step = None
    user.recovery_code_hashes = []
    # End any sign-in already in progress for this person.
    for open_challenge in (
        await db.execute(select(OtpSession).where(OtpSession.user_id == user.id, OtpSession.used.is_(False)))
    ).scalars():
        open_challenge.used = True
    _audit(db, user, "TWO_FACTOR_RESET", actor=admin, details={"email": user.email})
    await db.commit()
    return UserOut.model_validate(await load_user(db, user.id))
