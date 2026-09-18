"""Partner integration API schemas — pull translated transactions for NFIU filing."""

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.entities import ReportType


class ExportMeta(BaseModel):
    period_start: datetime
    period_end: datetime
    report_type: str | None = None
    scope: str = "all"
    ctr_threshold_ngn: float | None = None
    total_matching: int
    returned: int
    offset: int
    limit: int | None = Field(
        default=None,
        description="Requested page size. Null means the caller omitted limit (all matching rows, server-capped).",
    )
    generated_at: datetime


class NfiuTransactionRow(BaseModel):
    """NFIU sample-data columns (CTR SAMPLE DATA NOVA.xlsx), used for all export pulls."""

    model_config = ConfigDict(populate_by_name=True)

    t_account_number: str
    t_trans_number: str
    t_location: str
    transaction_description: str
    t_date: str
    t_teller: str
    t_authorized: str
    t_late_deposit: int
    t_date_posting: str
    t_value_date: str
    t_transmode_code: str
    t_amount_local: float
    t_source_client_type: int
    t_source_type: str
    t_source_funds_code: str
    t_source_currency_code: str
    t_source_foreign_amount: float
    t_source_exchange_rate: float
    t_source_country: str
    t_source_institution_code: str
    t_source_institution_name: str
    t_source_account_number: str
    t_source_account_name: str
    t_source_person_first_name: str
    t_source_person_last_name: str
    t_source_entity_name: str
    t_dest_client_type: int
    t_dest_type: str
    t_dest_funds_code: str
    t_dest_currency_code: str
    t_dest_foreign_amount: float
    t_dest_exchange_rate: float
    t_dest_country: str
    t_dest_institution_code: str
    t_dest_institution_name: str
    t_dest_account_number: str
    t_dest_account_name: str
    t_dest_person_first_name: str
    t_dest_person_last_name: str
    t_dest_entity_name: str
    processed_date: str
    issues: str
    branch_name: str
    Tran_Type: str


class NfiuTransactionsResponse(BaseModel):
    meta: ExportMeta
    transactions: list[NfiuTransactionRow]


class ExportSummaryResponse(BaseModel):
    period_start: datetime
    period_end: datetime
    total_valid: int
    ctr_eligible: int
    ftr_eligible: int
    pep_eligible: int
    str_eligible: int
    generated_at: datetime


class ExportedReportSummary(BaseModel):
    id: str
    report_type: str
    status: str
    period_start: datetime
    period_end: datetime
    record_count: int
    created_at: datetime
    has_xml: bool
    has_csv: bool


class ExportReportsResponse(BaseModel):
    reports: list[ExportedReportSummary]
    returned: int


class PartnerVerifyResponse(BaseModel):
    status: str
    client_name: str
    key_prefix: str
    scopes: list[str]
    message: str


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


class IntegrationEndpointDoc(BaseModel):
    method: str
    path: str
    summary: str
    auth: str = "X-API-Key"


class IntegrationInfo(BaseModel):
    base_url: str
    openapi_url: str
    finacle_mode: str
    purpose: str
    auth_header: str
    endpoints: list[IntegrationEndpointDoc]


class DtdTransactionOut(BaseModel):
    finacle_ref: str
    channel: str
    transaction_date: datetime
    amount: float
    currency: str
    sender_name: str
    sender_account: str
    receiver_name: str
    receiver_account: str
    branch_code: str | None = None
    narration: str | None = None

    model_config = {"from_attributes": True}

    @field_validator("channel", mode="before")
    @classmethod
    def _channel_value(cls, value):
        return getattr(value, "value", value)


class DtdExportMeta(BaseModel):
    business_date: date
    source: str = "TBAADM.DTD"
    total_matching: int
    returned: int
    offset: int
    limit: int | None = None
    generated_at: datetime


class DtdExportResponse(BaseModel):
    meta: DtdExportMeta
    transactions: list[DtdTransactionOut]


class DtdPullRunOut(BaseModel):
    id: str
    status: str
    business_date: datetime
    records_new: int
    records_skipped: int
    started_at: datetime
    completed_at: datetime | None = None
    error_summary: str | None = None
    posted_since: datetime | None = None
    legs_fetched: int = 0

    model_config = {"from_attributes": True}

    @field_validator("status", mode="before")
    @classmethod
    def _status_value(cls, value):
        return getattr(value, "value", value)


class DtdFeedStatus(BaseModel):
    enabled: bool
    interval_minutes: int
    business_date: str
    started_at: datetime | None = None
    started_by: str | None = None
    stopped_at: datetime | None = None
    stopped_by: str | None = None
    last_success_at: datetime | None = None
    last_error: str | None = None
    watermark_at: datetime | None = None
    next_run_at: datetime | None = None
    pulls_today: int
    new_today: int
    skipped_today: int
    staged_today: int
    dtd_means: str
    runs: list[DtdPullRunOut]
    transactions: list[DtdTransactionOut]
