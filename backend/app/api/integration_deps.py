from __future__ import annotations

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import verify_api_key
from app.models.entities import ApiKey


async def get_api_client(
    x_api_key: str | None = Header(None, alias="X-API-Key"),
    db: AsyncSession = Depends(get_db),
) -> ApiKey:
    if not x_api_key or not x_api_key.startswith("nova_"):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Valid X-API-Key header required")

    prefix = x_api_key[:12]
    result = await db.execute(
        select(ApiKey).where(ApiKey.key_prefix == prefix, ApiKey.is_active.is_(True))
    )
    candidates = result.scalars().all()
    for key in candidates:
        if verify_api_key(x_api_key, key.key_hash):
            from datetime import datetime, timezone

            key.last_used_at = datetime.now(timezone.utc)
            await db.commit()
            return key

    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid API key")
