"""Pull TBAADM.DTD (posted, not deleted), pair like HTD, stage into dtd_transactions."""

from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.entities import (
    DtdPullRun,
    DtdTransaction,
    ExtractionStatus,
    TransactionChannel as DbChannel,
)
from app.services.etl.customer_registry import CustomerRegistry
from app.services.etl.htd_mapper import map_htd_rows
from app.services.etl.oracle_client import get_oracledb
from app.services.etl.oracle_source import HTD_BETWEEN_PAGES_SEC, HtdDayCursor, OracleFinacleSource

logger = logging.getLogger("nova.etl")


def _bank_tz() -> ZoneInfo:
    return ZoneInfo(settings.finacle_timezone)


def lagos_day_bounds(day: date) -> tuple[datetime, datetime, datetime]:
    """Naive Oracle window + timezone-aware business_date start."""
    tz = _bank_tz()
    start_aware = datetime.combine(day, time.min, tzinfo=tz)
    start_naive = datetime.combine(day, time.min)
    end_exclusive = datetime.combine(day + timedelta(days=1), time.min)
    return start_aware, start_naive, end_exclusive


class DtdPipeline:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def pull_day(self, day: date | None = None, posted_since: datetime | None = None) -> DtdPullRun:
        tz = _bank_tz()
        day = day or datetime.now(tz).date()
        business_start, day_start, day_end = lagos_day_bounds(day)
        since_naive = day_start
        if posted_since is not None:
            if posted_since.tzinfo is None:
                since_naive = posted_since
            else:
                since_naive = posted_since.astimezone(tz).replace(tzinfo=None)
        since_aware = since_naive.replace(tzinfo=tz)

        run = DtdPullRun(
            status=ExtractionStatus.RUNNING,
            business_date=business_start,
            posted_since=since_aware,
        )
        self.db.add(run)
        await self.db.commit()
        await self.db.refresh(run)

        source = OracleFinacleSource()
        oracledb = get_oracledb()
        customers = CustomerRegistry.default()
        cursor = HtdDayCursor()
        total_new = total_skipped = 0

        try:
            while not cursor.done:
                flush_rows, cursor = await asyncio.to_thread(
                    source.fetch_dtd_flush_page,
                    oracledb,
                    settings.finacle_admin_schema,
                    day_start,
                    day_end,
                    cursor,
                    since_naive,
                )
                raw = map_htd_rows(flush_rows, customers) if flush_rows else []
                new, skipped = await self._stage(run.id, business_start, raw)
                total_new += new
                total_skipped += skipped
                run.records_new = total_new
                run.records_skipped = total_skipped
                run.legs_fetched = cursor.legs_fetched
                await self.db.commit()
                if not cursor.done:
                    await asyncio.sleep(HTD_BETWEEN_PAGES_SEC)

            run.status = ExtractionStatus.SUCCESS
            run.completed_at = datetime.now(timezone.utc)
            await self.db.commit()
            logger.info(
                "DTD pull %s for %s since %s: new=%s skipped=%s legs=%s",
                run.id[:8],
                day.isoformat(),
                since_naive.isoformat(sep=" "),
                total_new,
                total_skipped,
                cursor.legs_fetched,
            )
        except Exception as exc:
            run.status = ExtractionStatus.FAILED
            run.completed_at = datetime.now(timezone.utc)
            run.error_summary = str(exc)
            run.records_new = total_new
            run.records_skipped = total_skipped
            await self.db.commit()
            logger.exception("DTD pull failed: %s", exc)
        return run

    async def _stage(self, run_id: str, business_start: datetime, records) -> tuple[int, int]:
        if not records:
            return 0, 0
        refs = [r.finacle_ref for r in records]
        result = await self.db.execute(
            select(DtdTransaction.finacle_ref).where(
                and_(
                    DtdTransaction.business_date == business_start,
                    DtdTransaction.finacle_ref.in_(refs),
                )
            )
        )
        existing = set(result.scalars().all())
        seen: set[str] = set()
        new = skipped = 0
        for raw in records:
            if raw.finacle_ref in existing or raw.finacle_ref in seen:
                skipped += 1
                continue
            seen.add(raw.finacle_ref)
            self.db.add(
                DtdTransaction(
                    pull_run_id=run_id,
                    business_date=business_start,
                    finacle_ref=raw.finacle_ref,
                    channel=DbChannel(raw.channel.value),
                    transaction_date=raw.transaction_date,
                    amount=raw.amount,
                    currency=raw.currency,
                    sender_name=raw.sender_name,
                    sender_account=raw.sender_account,
                    receiver_name=raw.receiver_name,
                    receiver_account=raw.receiver_account,
                    branch_code=raw.branch_code,
                    narration=raw.narration,
                )
            )
            new += 1
        await self.db.flush()
        return new, skipped
