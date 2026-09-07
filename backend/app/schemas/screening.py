from datetime import datetime
from enum import Enum

from pydantic import BaseModel


class AlertStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    ESCALATED = "escalated"


class ScreeningType(str, Enum):
    TRANSACTION = "transaction"
    ONBOARDING = "onboarding"


class ScreeningAlertOut(BaseModel):
    id: str
    finacle_ref: str
    screening_type: ScreeningType
    status: AlertStatus
    sender_name: str
    receiver_name: str
    amount: float
    currency: str
    channel: str
    watchlist_source: str
    matched_name: str
    match_score: float
    latency_ms: int
    reviewed_by: str | None
    reviewed_at: datetime | None
    notes: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ScreeningDashboard(BaseModel):
    pending_alerts: int
    total_screened_today: int
    escalated: int
    avg_latency_ms: float
    false_positive_rate: float
    resolved_today: int


class ScreeningPerformance(BaseModel):
    by_watchlist: dict[str, int]
    by_status: dict[str, int]
    recent_latency_ms: list[int]


class AlertActionRequest(BaseModel):
    actor_name: str = "Compliance Officer"
    notes: str | None = None


class SimulateRequest(BaseModel):
    count: int = 5
