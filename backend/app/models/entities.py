from __future__ import annotations

import enum
from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, Enum, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class UserRole(str, enum.Enum):
    VIEWER = "viewer"
    ANALYST = "analyst"
    APPROVER = "approver"
    ADMIN = "admin"


class ReportType(str, enum.Enum):
    CTR = "CTR"
    FTR = "FTR"
    STR = "STR"
    PEP = "PEP"


class ReportStatus(str, enum.Enum):
    DRAFT = "draft"
    PENDING_REVIEW = "pending_review"
    APPROVED = "approved"
    SUBMITTED = "submitted"
    REJECTED = "rejected"


class ExtractionStatus(str, enum.Enum):
    RUNNING = "running"
    SUCCESS = "success"
    PARTIAL = "partial"
    FAILED = "failed"


class TransactionChannel(str, enum.Enum):
    NIP = "NIP"
    SWIFT = "SWIFT"
    RTGS = "RTGS"
    NEFT = "NEFT"
    NAPS = "NAPS"
    CASH_DEPOSIT = "CASH_DEPOSIT"
    CASH_WITHDRAWAL = "CASH_WITHDRAWAL"
    MOBILE = "MOBILE"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(255))
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.ANALYST)
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class OtpSession(Base):
    __tablename__ = "otp_sessions"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"), index=True)
    code: Mapped[str] = mapped_column(String(6))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ExtractionRun(Base):
    __tablename__ = "extraction_runs"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[ExtractionStatus] = mapped_column(Enum(ExtractionStatus), default=ExtractionStatus.RUNNING)
    source: Mapped[str] = mapped_column(String(50), default="finacle_replica")
    channels: Mapped[list] = mapped_column(JSONB, default=list)
    records_extracted: Mapped[int] = mapped_column(Integer, default=0)
    records_valid: Mapped[int] = mapped_column(Integer, default=0)
    records_invalid: Mapped[int] = mapped_column(Integer, default=0)
    error_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    external_batch_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)

    logs: Mapped[list["ExtractionLog"]] = relationship(back_populates="run", cascade="all, delete-orphan")
    transactions: Mapped[list["StagingTransaction"]] = relationship(back_populates="extraction_run")


class ExtractionLog(Base):
    __tablename__ = "extraction_logs"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    run_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("extraction_runs.id"), index=True)
    level: Mapped[str] = mapped_column(String(20), default="INFO")
    channel: Mapped[str | None] = mapped_column(String(50), nullable=True)
    message: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    run: Mapped["ExtractionRun"] = relationship(back_populates="logs")


class StagingTransaction(Base):
    __tablename__ = "staging_transactions"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    extraction_run_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("extraction_runs.id"), index=True)
    finacle_ref: Mapped[str] = mapped_column(String(100), index=True)
    channel: Mapped[TransactionChannel] = mapped_column(Enum(TransactionChannel))
    transaction_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    amount: Mapped[float] = mapped_column(Float)
    currency: Mapped[str] = mapped_column(String(3), default="NGN")
    sender_name: Mapped[str] = mapped_column(String(255))
    sender_account: Mapped[str] = mapped_column(String(50))
    receiver_name: Mapped[str] = mapped_column(String(255))
    receiver_account: Mapped[str] = mapped_column(String(50))
    branch_code: Mapped[str] = mapped_column(String(20), default="001")
    narration: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_valid: Mapped[bool] = mapped_column(default=True)
    validation_errors: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    reportable_ctr: Mapped[bool] = mapped_column(default=False)
    reportable_ftr: Mapped[bool] = mapped_column(default=False)
    reportable_pep: Mapped[bool] = mapped_column(default=False)
    reportable_str: Mapped[bool] = mapped_column(default=False)
    nfiu_payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    extraction_run: Mapped["ExtractionRun"] = relationship(back_populates="transactions")


class RegulatoryReport(Base):
    __tablename__ = "regulatory_reports"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    report_type: Mapped[ReportType] = mapped_column(Enum(ReportType))
    status: Mapped[ReportStatus] = mapped_column(Enum(ReportStatus), default=ReportStatus.DRAFT)
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    record_count: Mapped[int] = mapped_column(Integer, default=0)
    xml_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    csv_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    preview_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_by: Mapped[str | None] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True)
    approved_by: Mapped[str | None] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    submitted_to: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    actor_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True)
    actor_name: Mapped[str] = mapped_column(String(255))
    action: Mapped[str] = mapped_column(String(100))
    entity_type: Mapped[str] = mapped_column(String(50))
    entity_id: Mapped[str] = mapped_column(String(100))
    details: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ApiKey(Base):
    __tablename__ = "api_keys"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    key_prefix: Mapped[str] = mapped_column(String(12), index=True)
    key_hash: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(default=True)
    created_by: Mapped[str | None] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AlertStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    ESCALATED = "escalated"


class ScreeningType(str, enum.Enum):
    TRANSACTION = "transaction"
    ONBOARDING = "onboarding"


class ScreeningAlert(Base):
    __tablename__ = "screening_alerts"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    finacle_ref: Mapped[str] = mapped_column(String(100), index=True)
    screening_type: Mapped[ScreeningType] = mapped_column(Enum(ScreeningType), default=ScreeningType.TRANSACTION)
    status: Mapped[AlertStatus] = mapped_column(Enum(AlertStatus), default=AlertStatus.PENDING, index=True)
    sender_name: Mapped[str] = mapped_column(String(255))
    receiver_name: Mapped[str] = mapped_column(String(255))
    amount: Mapped[float] = mapped_column(Float)
    currency: Mapped[str] = mapped_column(String(3), default="NGN")
    channel: Mapped[str] = mapped_column(String(50), default="NIP")
    watchlist_source: Mapped[str] = mapped_column(String(100))
    matched_name: Mapped[str] = mapped_column(String(255))
    match_score: Mapped[float] = mapped_column(Float)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    reviewed_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
