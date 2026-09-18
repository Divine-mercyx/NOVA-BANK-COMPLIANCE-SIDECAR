from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_analyst
from app.core.database import get_db
from app.models.entities import User
from app.schemas.integration import DtdFeedStatus, DtdPullRunOut, DtdTransactionOut
from app.services.etl import dtd_control

router = APIRouter(prefix="/api/v1/dtd", tags=["dtd"], dependencies=[Depends(get_current_user)])


def _status(data: dict) -> DtdFeedStatus:
    return DtdFeedStatus(
        enabled=data["enabled"],
        interval_minutes=data["interval_minutes"],
        business_date=data["business_date"],
        started_at=data["started_at"],
        started_by=data["started_by"],
        stopped_at=data["stopped_at"],
        stopped_by=data["stopped_by"],
        last_success_at=data["last_success_at"],
        last_error=data["last_error"],
        watermark_at=data["watermark_at"],
        next_run_at=data["next_run_at"],
        pulls_today=data["pulls_today"],
        new_today=data["new_today"],
        skipped_today=data["skipped_today"],
        staged_today=data["staged_today"],
        dtd_means=data["dtd_means"],
        runs=[DtdPullRunOut.model_validate(r) for r in data["runs"]],
        transactions=[DtdTransactionOut.model_validate(t) for t in data["transactions"]],
    )


@router.get("/status", response_model=DtdFeedStatus)
async def dtd_status(db: AsyncSession = Depends(get_db)):
    return _status(await dtd_control.snapshot(db))


@router.post("/start", response_model=DtdFeedStatus)
async def dtd_start(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_analyst()),
):
    return _status(await dtd_control.start_feed(db, user))


@router.post("/stop", response_model=DtdFeedStatus)
async def dtd_stop(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_analyst()),
):
    return _status(await dtd_control.stop_feed(db, user))
