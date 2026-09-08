from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_analyst, require_approver
from app.core.config import settings
from app.core.database import get_db
from app.models.entities import (
    ExtractionLog,
    ExtractionRun,
    RegulatoryReport,
    ReportStatus,
    StagingTransaction,
    TransactionChannel,
    User,
)
from app.schemas.compliance import (
    AuditEventOut,
    DashboardStats,
    DataQualityMetrics,
    ExtractionLogOut,
    ExtractionRequest,
    ExtractionRunSummary,
    ReportActionRequest,
    ReportGenerateRequest,
    ReportOut,
    StagingTransactionOut,
    UserOut,
)
from app.services.analytics import AnalyticsService, AuditService, ReportWorkflowService
from app.services.etl.background import execute_etl_background
from app.services.etl.pipeline import ETLPipeline
from app.services.reports.generator import ReportGenerator

router = APIRouter(prefix="/api/v1", tags=["compliance"], dependencies=[Depends(get_current_user)])


@router.get("/dashboard", response_model=DashboardStats)
async def dashboard(db: AsyncSession = Depends(get_db)):
    analytics = AnalyticsService(db)
    audit = AuditService(db)
    quality = await analytics.get_data_quality()

    last_run_result = await db.execute(
        select(ExtractionRun).order_by(desc(ExtractionRun.started_at)).limit(1)
    )
    last_run = last_run_result.scalar_one_or_none()

    total_tx = await db.execute(select(func.count()).select_from(StagingTransaction))
    pending = await db.execute(
        select(func.count())
        .select_from(RegulatoryReport)
        .where(RegulatoryReport.status.in_([ReportStatus.DRAFT, ReportStatus.PENDING_REVIEW]))
    )
    submitted = await db.execute(
        select(func.count())
        .select_from(RegulatoryReport)
        .where(RegulatoryReport.status == ReportStatus.SUBMITTED)
    )

    pipeline_status = "idle"
    if last_run:
        pipeline_status = last_run.status.value

    return DashboardStats(
        pipeline_status=pipeline_status,
        finacle_mode=settings.finacle_mode,
        last_extraction=ExtractionRunSummary.model_validate(last_run) if last_run else None,
        total_staged_transactions=total_tx.scalar_one() or 0,
        pending_reports=pending.scalar_one() or 0,
        submitted_reports=submitted.scalar_one() or 0,
        data_quality=quality,
        recent_audit=[AuditEventOut.model_validate(e) for e in await audit.list_recent(8)],
    )


@router.post("/etl/run", response_model=ExtractionRunSummary)
async def run_etl(
    body: ExtractionRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_analyst()),
):
    """Start extraction in the background — poll GET /etl/runs/{id} and /logs for progress."""
    pipeline = ETLPipeline(db)
    run = await pipeline.start_run(body.channels, body.date_from, body.date_to)
    background_tasks.add_task(
        execute_etl_background,
        run.id,
        body.channels,
        body.date_from,
        body.date_to,
        user.full_name or user.email,
    )
    return ExtractionRunSummary.model_validate(run)


@router.get("/etl/runs/{run_id}", response_model=ExtractionRunSummary)
async def get_run(run_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ExtractionRun).where(ExtractionRun.id == run_id))
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Extraction run not found")
    return ExtractionRunSummary.model_validate(run)


@router.get("/etl/runs", response_model=list[ExtractionRunSummary])
async def list_runs(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ExtractionRun).order_by(desc(ExtractionRun.started_at)).limit(20))
    return [ExtractionRunSummary.model_validate(r) for r in result.scalars().all()]


@router.get("/etl/runs/{run_id}/logs", response_model=list[ExtractionLogOut])
async def run_logs(run_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ExtractionLog)
        .where(ExtractionLog.run_id == run_id)
        .order_by(ExtractionLog.created_at)
    )
    return [ExtractionLogOut.model_validate(log) for log in result.scalars().all()]


@router.get("/staging/transactions", response_model=list[StagingTransactionOut])
async def list_transactions(
    limit: int = Query(50, le=200),
    valid_only: bool = False,
    channel: TransactionChannel | None = None,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(StagingTransaction).order_by(desc(StagingTransaction.transaction_date)).limit(limit)
    if valid_only:
        stmt = stmt.where(StagingTransaction.is_valid.is_(True))
    if channel:
        stmt = stmt.where(StagingTransaction.channel == channel)
    result = await db.execute(stmt)
    return [StagingTransactionOut.model_validate(t) for t in result.scalars().all()]


@router.get("/analytics/quality", response_model=DataQualityMetrics)
async def data_quality(db: AsyncSession = Depends(get_db)):
    return await AnalyticsService(db).get_data_quality()


@router.post("/reports/generate", response_model=ReportOut)
async def generate_report(
    body: ReportGenerateRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_analyst()),
):
    report = await ReportGenerator(db).generate(body.report_type, body.period_start, body.period_end)
    return ReportOut.model_validate(report)


@router.get("/reports", response_model=list[ReportOut])
async def list_reports(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(RegulatoryReport).order_by(desc(RegulatoryReport.created_at)))
    return [ReportOut.model_validate(r) for r in result.scalars().all()]


@router.get("/reports/{report_id}", response_model=ReportOut)
async def get_report(report_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(RegulatoryReport).where(RegulatoryReport.id == report_id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(404, "Report not found")
    return ReportOut.model_validate(report)


@router.post("/reports/{report_id}/approve", response_model=ReportOut)
async def approve_report(
    report_id: str,
    body: ReportActionRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_approver()),
):
    try:
        report = await ReportWorkflowService(db).approve(report_id, body.actor_name)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc
    return ReportOut.model_validate(report)


@router.post("/reports/{report_id}/submit", response_model=ReportOut)
async def submit_report(
    report_id: str,
    body: ReportActionRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_approver()),
):
    try:
        report = await ReportWorkflowService(db).submit(report_id, body.actor_name)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return ReportOut.model_validate(report)


@router.post("/reports/{report_id}/reject", response_model=ReportOut)
async def reject_report(
    report_id: str,
    body: ReportActionRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_approver()),
):
    try:
        report = await ReportWorkflowService(db).reject(report_id, body.actor_name, body.notes)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc
    return ReportOut.model_validate(report)


@router.get("/audit", response_model=list[AuditEventOut])
async def audit_trail(db: AsyncSession = Depends(get_db)):
    events = await AuditService(db).list_recent(50)
    return [AuditEventOut.model_validate(e) for e in events]


@router.get("/users", response_model=list[UserOut])
async def list_users(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).order_by(User.full_name))
    return [UserOut.model_validate(u) for u in result.scalars().all()]
