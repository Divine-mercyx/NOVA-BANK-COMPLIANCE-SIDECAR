from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_analyst, require_approver
from app.core.database import get_db
from app.models.entities import AlertStatus, AuditEvent, ScreeningAlert, User
from app.schemas.screening import (
    AlertActionRequest,
    ScreeningAlertOut,
    ScreeningDashboard,
    ScreeningPerformance,
    SimulateRequest,
)
from app.services.screening.engine import ScreeningService

router = APIRouter(prefix="/api/v1/screening", tags=["screening"], dependencies=[Depends(get_current_user)])


@router.get("/dashboard", response_model=ScreeningDashboard)
async def screening_dashboard(db: AsyncSession = Depends(get_db)):
    return ScreeningDashboard(**await ScreeningService(db).dashboard_stats())


@router.get("/performance", response_model=ScreeningPerformance)
async def screening_performance(db: AsyncSession = Depends(get_db)):
    return ScreeningPerformance(**await ScreeningService(db).performance_metrics())


@router.get("/alerts", response_model=list[ScreeningAlertOut])
async def list_alerts(
    status: AlertStatus | None = Query(None),
    limit: int = Query(50, le=100),
    db: AsyncSession = Depends(get_db),
):
    alerts = await ScreeningService(db).list_alerts(status, limit)
    return [ScreeningAlertOut.model_validate(a) for a in alerts]


@router.get("/alerts/{alert_id}", response_model=ScreeningAlertOut)
async def get_alert(alert_id: str, db: AsyncSession = Depends(get_db)):
    alert = await ScreeningService(db).get_alert(alert_id)
    if not alert:
        raise HTTPException(404, "Alert not found")
    return ScreeningAlertOut.model_validate(alert)


@router.post("/simulate", response_model=list[ScreeningAlertOut])
async def simulate_alerts(
    body: SimulateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_analyst()),
):
    alerts = await ScreeningService(db).simulate_alerts(body.count, user.full_name)
    return [ScreeningAlertOut.model_validate(a) for a in alerts]


@router.post("/alerts/{alert_id}/approve", response_model=ScreeningAlertOut)
async def approve_alert(
    alert_id: str,
    body: AlertActionRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_analyst()),
):
    try:
        alert = await ScreeningService(db).resolve(alert_id, AlertStatus.APPROVED, body.actor_name, body.notes)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc
    return ScreeningAlertOut.model_validate(alert)


@router.post("/alerts/{alert_id}/reject", response_model=ScreeningAlertOut)
async def reject_alert(
    alert_id: str,
    body: AlertActionRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_analyst()),
):
    try:
        alert = await ScreeningService(db).resolve(alert_id, AlertStatus.REJECTED, body.actor_name, body.notes)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc
    return ScreeningAlertOut.model_validate(alert)


@router.post("/alerts/{alert_id}/escalate", response_model=ScreeningAlertOut)
async def escalate_alert(
    alert_id: str,
    body: AlertActionRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_approver()),
):
    try:
        alert = await ScreeningService(db).resolve(alert_id, AlertStatus.ESCALATED, body.actor_name, body.notes)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc
    return ScreeningAlertOut.model_validate(alert)


@router.get("/audit", response_model=list[dict])
async def screening_audit(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(AuditEvent)
        .where(AuditEvent.entity_type == "screening_alert")
        .order_by(desc(AuditEvent.created_at))
        .limit(50)
    )
    events = result.scalars().all()
    return [
        {
            "id": e.id,
            "actor_name": e.actor_name,
            "action": e.action,
            "entity_id": e.entity_id,
            "details": e.details,
            "created_at": e.created_at.isoformat(),
        }
        for e in events
    ]
