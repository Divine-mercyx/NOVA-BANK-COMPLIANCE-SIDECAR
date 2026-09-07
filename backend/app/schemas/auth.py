from pydantic import BaseModel, EmailStr, Field

from app.schemas.compliance import UserOut, UserRole


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
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class CreateStaffRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str
    role: UserRole = UserRole.ANALYST


class UpdateStaffRequest(BaseModel):
    email: EmailStr | None = None
    full_name: str | None = None
    role: UserRole | None = None
    password: str | None = Field(default=None, min_length=8)
    is_active: bool | None = None

