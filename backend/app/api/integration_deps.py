from __future__ import annotations

from datetime import datetime, timezone

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import parse_api_key_lookup, verify_api_key
from app.models.entities import ApiKey


async def get_api_client(
    x_api_key: str | None = Header(None, alias="X-API-Key"),
    db: AsyncSession = Depends(get_db),
) -> ApiKey:
    raw = (x_api_key or "").strip()
    if not raw.startswith("nova_"):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Valid X-API-Key header required")

    lookups = parse_api_key_lookup(raw)
    if not lookups:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Malformed API key")

    result = await db.execute(
        select(ApiKey).where(ApiKey.key_prefix.in_(lookups), ApiKey.is_active.is_(True))
    )
    candidates = result.scalars().all()
    for key in candidates:
        if verify_api_key(raw, key.key_hash):
            key.last_used_at = datetime.now(timezone.utc)
            await db.commit()
            return key

    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or revoked API key")
