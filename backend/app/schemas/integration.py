"""Partner integration API schemas — pull translated transactions for NFIU filing."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.entities import ReportType


class ReportFlags(BaseModel):
    ctr: bool
    ftr: bool
    pep: bool
    str: bool


class ExportedTransaction(BaseModel):
    id: str
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
    is_valid: bool
    validation_errors: list | None = None
    report_flags: ReportFlags
    nfiu_payload: dict = Field(..., description="NFIU-ready translated transaction payload")


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


class NfiuCtrRow(BaseModel):
    """Column layout from NFIU CTR SAMPLE DATA NOVA.xlsx."""

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


class ExportTransactionsResponse(BaseModel):
    meta: ExportMeta
    transactions: list[ExportedTransaction]


class NfiuCtrExportResponse(BaseModel):
    meta: ExportMeta
    transactions: list[NfiuCtrRow]


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
