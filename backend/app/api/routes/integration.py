from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_roles
from app.api.integration_deps import get_api_client
from app.core.config import settings
from app.core.database import get_db
from app.core.security import generate_api_key
from app.models.entities import ApiKey, AuditEvent, ReportType, TransactionChannel, User, UserRole
from app.schemas.integration import (
    ApiKeyCreateRequest,
    ApiKeyCreated,
    ApiKeyOut,
    ExportReportsResponse,
    ExportSummaryResponse,
    ExportTransactionsResponse,
    ExportedTransaction,
    IntegrationEndpointDoc,
    IntegrationInfo,
    NfiuCtrExportResponse,
    PartnerVerifyResponse,
    ScreeningCheckRequest,
    ScreeningCheckResponse,
)
from app.services.integration.export_service import EXPORT_UNBOUNDED_CAP, ExportService
from app.services.integration.period import export_period_params
from app.services.integration.screening_check import ScreeningCheckService

router = APIRouter(prefix="/api/v1/integration", tags=["integration"])
partner_router = APIRouter(prefix="/api/v1/export", tags=["export"])

EXPORT_DOCS = [
    IntegrationEndpointDoc(
        method="GET",
        path="/api/v1/export/verify",
        summary="Verify API key and return client identity",
    ),
    IntegrationEndpointDoc(
        method="GET",
        path="/api/v1/export/summary",
        summary="Counts of valid and report-eligible transactions for a date range",
    ),
    IntegrationEndpointDoc(
        method="GET",
        path="/api/v1/export/transactions",
        summary="Pull all staged transactions for a date range (date_from, date_to)",
    ),
    IntegrationEndpointDoc(
        method="GET",
        path="/api/v1/export/transactions/ctr",
        summary="Pull NFIU CTR rows (₦5m+ NGN) in the goAML sample-data column layout",
    ),
    IntegrationEndpointDoc(
        method="GET",
        path="/api/v1/export/transactions/{finacle_ref}",
        summary="Pull a single translated transaction by Finacle reference",
    ),
    IntegrationEndpointDoc(
        method="GET",
        path="/api/v1/export/reports",
        summary="List generated regulatory reports available for download",
    ),
    IntegrationEndpointDoc(
        method="GET",
        path="/api/v1/export/reports/{report_id}/download",
        summary="Download report XML or CSV file (format=xml|csv)",
    ),
]


@partner_router.get("/verify", response_model=PartnerVerifyResponse)
async def verify_partner_key(
    client: ApiKey = Depends(get_api_client),
    db: AsyncSession = Depends(get_db),
):
    data = await ExportService(db).verify_client(client.name, client.key_prefix)
    return PartnerVerifyResponse(**data)


@partner_router.get("/summary", response_model=ExportSummaryResponse)
async def export_summary(
    period: tuple[datetime, datetime] = Depends(export_period_params),
    client: ApiKey = Depends(get_api_client),
    db: AsyncSession = Depends(get_db),
):
    period_start, period_end = period
    return await ExportService(db).summary(period_start, period_end)


@partner_router.get("/transactions", response_model=ExportTransactionsResponse)
async def export_transactions(
    period: tuple[datetime, datetime] = Depends(export_period_params),
    valid_only: bool = Query(False, description="If true, skip invalid staged rows"),
    channel: str | None = Query(None, description="Optional channel filter, e.g. NIP or RTGS"),
    limit: int | None = Query(
        None,
        ge=1,
        le=EXPORT_UNBOUNDED_CAP,
        description="Max rows to return. Omit to fetch all matching rows (capped at 50,000).",
    ),
    offset: int = Query(0, ge=0),
    client: ApiKey = Depends(get_api_client),
    db: AsyncSession = Depends(get_db),
):
    period_start, period_end = period
    channel_filter = _parse_channel(channel)
    return await ExportService(db).list_transactions(
        period_start,
        period_end,
        valid_only=valid_only,
        channel=channel_filter,
        limit=limit,
        offset=offset,
        scope="all",
    )


@partner_router.get("/transactions/ctr", response_model=NfiuCtrExportResponse)
async def export_ctr_transactions(
    period: tuple[datetime, datetime] = Depends(export_period_params),
    valid_only: bool = Query(False),
    channel: str | None = Query(None),
    limit: int | None = Query(
        None,
        ge=1,
        le=EXPORT_UNBOUNDED_CAP,
        description="Max rows to return. Omit to fetch all matching CTR rows (capped at 50,000).",
    ),
    offset: int = Query(0, ge=0),
    client: ApiKey = Depends(get_api_client),
    db: AsyncSession = Depends(get_db),
):
    """NGN staged transactions at or above the CTR amount cap (default ₦5,000,000)."""
    period_start, period_end = period
    channel_filter = _parse_channel(channel)
    return await ExportService(db).list_transactions(
        period_start,
        period_end,
        valid_only=valid_only,
        channel=channel_filter,
        limit=limit,
        offset=offset,
        scope="ctr",
    )


def _parse_channel(channel: str | None) -> TransactionChannel | None:
    if not channel:
        return None
    try:
        return TransactionChannel(channel.upper())
    except ValueError as exc:
        raise HTTPException(400, f"Unknown channel: {channel}") from exc


@partner_router.get("/transactions/{finacle_ref}", response_model=ExportedTransaction)
async def export_transaction(
    finacle_ref: str,
    client: ApiKey = Depends(get_api_client),
    db: AsyncSession = Depends(get_db),
):
    result = await ExportService(db).get_transaction(finacle_ref)
    if not result:
        raise HTTPException(404, "Transaction not found in staging warehouse")
    return result


@partner_router.get("/reports", response_model=ExportReportsResponse)
async def export_reports(
    period_start: datetime | None = Query(None),
    period_end: datetime | None = Query(None),
    report_type: ReportType | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    client: ApiKey = Depends(get_api_client),
    db: AsyncSession = Depends(get_db),
):
    return await ExportService(db).list_reports(period_start, period_end, report_type, limit)


@partner_router.get("/reports/{report_id}/download")
async def download_report(
    report_id: str,
    format: str = Query("xml", pattern="^(xml|csv)$"),
    client: ApiKey = Depends(get_api_client),
    db: AsyncSession = Depends(get_db),
):
    payload = await ExportService(db).read_report_file(report_id, format)
    if not payload:
        raise HTTPException(404, "Report or file not found")
    content, media_type, filename = payload
    return PlainTextResponse(
        content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@partner_router.post("/screening/check", response_model=ScreeningCheckResponse, include_in_schema=False)
async def screening_check_legacy(
    body: ScreeningCheckRequest,
    client: ApiKey = Depends(get_api_client),
    db: AsyncSession = Depends(get_db),
):
    """Legacy screening path — prefer /api/v1/screening/check via portal JWT."""
    return await ScreeningCheckService(db).check(body, client.name)


@router.get("/info", response_model=IntegrationInfo)
async def integration_info(_: User = Depends(get_current_user)):
    return IntegrationInfo(
        base_url=settings.api_base_url,
        openapi_url=f"{settings.api_base_url}/docs",
        finacle_mode=settings.finacle_mode,
        purpose=(
            "Nova Bank IT pulls staged Finacle transactions with X-API-Key. "
            "GET /export/transactions for the full date range; "
            "GET /export/transactions/ctr for NFIU CTR rows (NGN ₦5,000,000 and above)."
        ),
        auth_header="X-API-Key",
        endpoints=EXPORT_DOCS,
    )


@router.get("/keys", response_model=list[ApiKeyOut])
async def list_api_keys(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN)),
):
    result = await db.execute(select(ApiKey).order_by(ApiKey.created_at.desc()))
    return [ApiKeyOut.model_validate(k) for k in result.scalars().all()]


@router.post("/keys", response_model=ApiKeyCreated)
async def create_api_key(
    body: ApiKeyCreateRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_roles(UserRole.ADMIN)),
):
    full_key, prefix, key_hash = generate_api_key()
    record = ApiKey(
        name=body.name,
        description=body.description,
        key_prefix=prefix,
        key_hash=key_hash,
        created_by=admin.id,
    )
    db.add(record)
    await db.flush()
    db.add(
        AuditEvent(
            actor_id=admin.id,
            actor_name=admin.full_name,
            action="API_KEY_CREATED",
            entity_type="api_key",
            entity_id=record.id,
            details={"name": body.name, "key_prefix": prefix},
        )
    )
    await db.commit()
    await db.refresh(record)

    base = ApiKeyOut.model_validate(record)
    return ApiKeyCreated(**base.model_dump(), api_key=full_key)


@router.delete("/keys/{key_id}", response_model=ApiKeyOut)
async def revoke_api_key(
    key_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_roles(UserRole.ADMIN)),
):
    result = await db.execute(select(ApiKey).where(ApiKey.id == key_id))
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(404, "API key not found")
    record.is_active = False
    db.add(
        AuditEvent(
            actor_id=admin.id,
            actor_name=admin.full_name,
            action="API_KEY_REVOKED",
            entity_type="api_key",
            entity_id=record.id,
            details={"name": record.name},
        )
    )
    await db.commit()
    await db.refresh(record)
    return ApiKeyOut.model_validate(record)
