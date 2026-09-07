"""Partner integration API schemas."""

from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.compliance import RawTransaction, TransactionChannel


class IngestTransactionIn(BaseModel):
    finacle_ref: str
    channel: TransactionChannel
    transaction_date: datetime
    amount: float
    currency: str = "NGN"
    sender_name: str
    sender_account: str
    receiver_name: str
    receiver_account: str
    branch_code: str = "001"
    narration: str | None = None


class IngestBatchRequest(BaseModel):
    batch_id: str = Field(..., min_length=1, max_length=100, description="Unique batch id from Nova middleware")
    transactions: list[IngestTransactionIn] = Field(..., min_length=1)


class IngestRecordResult(BaseModel):
    finacle_ref: str
    status: str
    errors: list[str] | None = None


class IngestBatchResponse(BaseModel):
    batch_id: str
    run_id: str
    status: str
    accepted: int
    rejected: int
    duplicate: int
    records: list[IngestRecordResult]


class ScreeningCheckRequest(BaseModel):
    finacle_ref: str
    sender_name: str
    receiver_name: str
    amount: float
    currency: str = "NGN"
    channel: str = "NIP"


class ScreeningMatch(BaseModel):
    watchlist_source: str
    matched_name: str
    match_score: float


class ScreeningCheckResponse(BaseModel):
    decision: str
    finacle_ref: str
    matches: list[ScreeningMatch]
    latency_ms: int
    alert_id: str | None = None


class ApiKeyCreateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    description: str | None = None


class ApiKeyOut(BaseModel):
    id: str
    name: str
    description: str | None
    key_prefix: str
    is_active: bool
    created_at: datetime
    last_used_at: datetime | None

    model_config = {"from_attributes": True}


class ApiKeyCreated(ApiKeyOut):
    api_key: str


class IntegrationInfo(BaseModel):
    base_url: str
    openapi_url: str
    finacle_mode: str
