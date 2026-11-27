from datetime import datetime
from typing import Any
from enum import Enum

from pydantic import BaseModel, Field, model_validator


class UserRole(str, Enum):
    VIEWER = "viewer"
    ANALYST = "analyst"
    APPROVER = "approver"
    ADMIN = "admin"


class ReportType(str, Enum):
    CTR = "CTR"
    FTR = "FTR"
    STR = "STR"
    PEP = "PEP"


class ReportStatus(str, Enum):
    DRAFT = "draft"
    PENDING_REVIEW = "pending_review"
    APPROVED = "approved"
    SUBMITTED = "submitted"
    REJECTED = "rejected"


class ExtractionStatus(str, Enum):
    RUNNING = "running"
    SUCCESS = "success"
    PARTIAL = "partial"
    FAILED = "failed"


class TransactionChannel(str, Enum):
    NIP = "NIP"
    SWIFT = "SWIFT"
    RTGS = "RTGS"
    NEFT = "NEFT"
    NAPS = "NAPS"
    CASH_DEPOSIT = "CASH_DEPOSIT"
    CASH_WITHDRAWAL = "CASH_WITHDRAWAL"
    MOBILE = "MOBILE"


class RawTransaction(BaseModel):
    finacle_ref: str
    channel: TransactionChannel
    transaction_date: datetime
    amount: float
    currency: str = "NGN"
    sender_name: str
    sender_account: str
    receiver_name: str
    receiver_account: str
    source_institution_code: str | None = None
    source_institution_name: str | None = None
    dest_institution_code: str | None = None
    dest_institution_name: str | None = None
    branch_code: str = "001"
    narration: str | None = None


class ExtractionRequest(BaseModel):
    channels: list[TransactionChannel] | None = None
    date_from: datetime | None = None
    date_to: datetime | None = None


class ExtractionRunSummary(BaseModel):
    id: str
    started_at: datetime
    completed_at: datetime | None
    status: ExtractionStatus
    source: str = "finacle_replica"
    channels: list
    date_from: datetime | None = None
    date_to: datetime | None = None
    records_extracted: int
    records_valid: int
    records_invalid: int
    error_summary: str | None = None

    model_config = {"from_attributes": True}


class ExtractionLogOut(BaseModel):
    id: str
    level: str
    channel: str | None
    message: str
    created_at: datetime

    model_config = {"from_attributes": True}


class StagingTransactionOut(BaseModel):
    id: str
    finacle_ref: str
    channel: TransactionChannel
    transaction_date: datetime
    amount: float
    currency: str
    sender_name: str
    sender_account: str
    receiver_name: str
    narration: str | None = None
    is_valid: bool
    validation_errors: list | None
    reportable_ctr: bool
    reportable_ftr: bool
    reportable_pep: bool
    reportable_str: bool

    model_config = {"from_attributes": True}


class DataQualityMetrics(BaseModel):
    total_records: int
    valid_records: int
    invalid_records: int
    validation_rate: float
    by_channel: dict[str, int]
    ctr_eligible: int
    ftr_eligible: int
    pep_eligible: int
    str_eligible: int
    last_extraction_at: datetime | None


class ReportGenerateRequest(BaseModel):
    report_type: ReportType
    period_start: datetime
    period_end: datetime


class ReportOut(BaseModel):
    id: str
    report_type: ReportType
    status: ReportStatus
    period_start: datetime
    period_end: datetime
    record_count: int
    xml_path: str | None
    csv_path: str | None
    preview_data: dict | None
    submitted_at: datetime | None
    submitted_to: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ReportActionRequest(BaseModel):
    actor_name: str = "Compliance Officer"
    notes: str | None = None


class AuditEventOut(BaseModel):
    id: str
    actor_name: str
    action: str
    entity_type: str
    entity_id: str
    details: dict | None
    created_at: datetime

    model_config = {"from_attributes": True}


class UserOut(BaseModel):
    id: str
    email: str
    full_name: str
    # Legacy fixed role; access comes from role_id and the permission lists.
    role: UserRole
    role_id: str | None = None
    role_name: str | None = None
    extra_permissions: list[str] = []
    revoked_permissions: list[str] = []
    # What the user can actually do: role permissions + extra - revoked.
    permissions: list[str] = []
    is_active: bool
    # Whether this person has an authenticator app connected (the team list shows who has not yet).
    two_factor_enabled: bool = False

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def _from_user(cls, data: Any) -> Any:
        if isinstance(data, dict) or not hasattr(data, "email"):
            return data
        from app.core.permissions import normalize

        role = getattr(data, "access_role", None)
        return {
            "id": data.id,
            "email": data.email,
            "full_name": data.full_name,
            "role": data.role,
            "role_id": getattr(data, "role_id", None),
            "role_name": role.name if role else None,
            "extra_permissions": normalize(getattr(data, "extra_permissions", None)),
            "revoked_permissions": normalize(getattr(data, "revoked_permissions", None)),
            "permissions": normalize(getattr(data, "permissions", None)),
            "is_active": data.is_active,
            "two_factor_enabled": bool(getattr(data, "totp_enabled", False)),
        }


class DashboardStats(BaseModel):
    pipeline_status: str
    finacle_mode: str
    last_extraction: ExtractionRunSummary | None
    total_staged_transactions: int
    pending_reports: int
    submitted_reports: int
    data_quality: DataQualityMetrics
    recent_audit: list[AuditEventOut]
