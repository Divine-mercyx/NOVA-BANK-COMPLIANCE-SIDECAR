from pydantic import BaseModel, EmailStr, Field

from app.schemas.compliance import UserOut


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    otp_session_id: str
    message: str


class VerifyOtpRequest(BaseModel):
    otp_session_id: str
    code: str = Field(min_length=6, max_length=6)


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
