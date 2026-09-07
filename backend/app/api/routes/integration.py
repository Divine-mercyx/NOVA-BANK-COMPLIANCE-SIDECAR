from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_current_user, require_roles
from app.api.integration_deps import get_api_client
from app.core.config import settings
from app.core.database import get_db
from app.core.security import generate_api_key
from app.models.entities import ApiKey, AuditEvent, User, UserRole
from app.schemas.integration import (
    ApiKeyCreateRequest,
    ApiKeyCreated,
    ApiKeyOut,
    IngestBatchRequest,
    IngestBatchResponse,
    IntegrationInfo,
    ScreeningCheckRequest,
    ScreeningCheckResponse,
)
from app.services.integration.ingest_service import IngestService
from app.services.integration.screening_check import ScreeningCheckService
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/api/v1/integration", tags=["integration"])
partner_router = APIRouter(prefix="/api/v1", tags=["partner"])


@partner_router.post("/ingest/transactions", response_model=IngestBatchResponse)
async def ingest_transactions(
    body: IngestBatchRequest,
    client: ApiKey = Depends(get_api_client),
    db: AsyncSession = Depends(get_db),
):
    return await IngestService(db).ingest_batch(body, client.name)


@partner_router.get("/ingest/batches/{batch_id}", response_model=IngestBatchResponse)
async def get_ingest_batch(
    batch_id: str,
    client: ApiKey = Depends(get_api_client),
    db: AsyncSession = Depends(get_db),
):
    result = await IngestService(db).get_batch(batch_id)
    if not result:
        raise HTTPException(404, "Batch not found")
    return result


@partner_router.post("/screening/check", response_model=ScreeningCheckResponse)
async def screening_check(
    body: ScreeningCheckRequest,
    client: ApiKey = Depends(get_api_client),
    db: AsyncSession = Depends(get_db),
):
    return await ScreeningCheckService(db).check(body, client.name)


@router.get("/info", response_model=IntegrationInfo)
async def integration_info(_: User = Depends(get_current_user)):
    return IntegrationInfo(
        base_url=settings.api_base_url,
        openapi_url=f"{settings.api_base_url}/docs",
        finacle_mode=settings.finacle_mode,
    )


@router.get("/keys", response_model=list[ApiKeyOut])
async def list_api_keys(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN)),
):
    from sqlalchemy import select

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
    out = ApiKeyCreated.model_validate(record)
    out.api_key = full_key
    return out


@router.delete("/keys/{key_id}", response_model=ApiKeyOut)
async def revoke_api_key(
    key_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_roles(UserRole.ADMIN)),
):
    from sqlalchemy import select

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
