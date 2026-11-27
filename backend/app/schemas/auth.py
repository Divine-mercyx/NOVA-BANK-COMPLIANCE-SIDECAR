from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, model_validator

from app.schemas.compliance import UserOut


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    """The password was right; the person still has to prove their authenticator app.

    `two_factor` says what the next screen is: "verify" (type the code from the app) or "setup" (first sign-in:
    connect an authenticator app first). The challenge (`otp_session_id`) is short-lived and allows a few tries.
    """

    otp_session_id: str
    message: str
    two_factor: Literal["verify", "setup"] = "verify"


class VerifyOtpRequest(BaseModel):
    """The six-digit code from the authenticator app, or one of the one-time recovery codes."""

    otp_session_id: str
    code: str | None = Field(default=None, min_length=6, max_length=6)
    recovery_code: str | None = Field(default=None, min_length=8, max_length=32)

    @model_validator(mode="after")
    def _one_of(self):
        if bool(self.code) == bool(self.recovery_code):
            raise ValueError("Send the six-digit code or a recovery code")
        return self


class TwoFactorSetupRequest(BaseModel):
    otp_session_id: str


class TwoFactorSetupResponse(BaseModel):
    """What the person adds to their authenticator app: the key, and the link a QR code carries."""

    secret: str
    otpauth_url: str
    issuer: str
    account: str


class TwoFactorEnableRequest(BaseModel):
    otp_session_id: str
    code: str = Field(min_length=6, max_length=6)


class TwoFactorEnableResponse(BaseModel):
    user: UserOut
    # Shown once. Each works one time if the phone is lost.
    recovery_codes: list[str]


class TwoFactorStatus(BaseModel):
    enabled: bool
    recovery_codes_left: int
    enabled_at: datetime | None = None


class RegenerateRecoveryCodesRequest(BaseModel):
    code: str = Field(min_length=6, max_length=6)


class RecoveryCodesResponse(BaseModel):
    recovery_codes: list[str]


class AuthResponse(BaseModel):
    """Session token is set as an httpOnly cookie and not returned in the body."""

    user: UserOut


class CreateStaffRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str = Field(min_length=1, max_length=255)
    role_id: str
    # Per-staff changes on top of the role (permission keys from app/core/permissions.py).
    extra_permissions: list[str] = []
    revoked_permissions: list[str] = []


class UpdateStaffRequest(BaseModel):
    email: EmailStr | None = None
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    role_id: str | None = None
    extra_permissions: list[str] | None = None
    revoked_permissions: list[str] | None = None
    password: str | None = Field(default=None, min_length=8)
    is_active: bool | None = None


class PermissionOut(BaseModel):
    key: str
    label: str
    group: str
    description: str


class RoleOut(BaseModel):
    id: str
    name: str
    description: str | None = None
    permissions: list[str]
    system_key: str | None = None
    all_permissions: bool
    user_count: int = 0


class RoleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=255)
    permissions: list[str] = []


class RoleUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=255)
    permissions: list[str] | None = None
