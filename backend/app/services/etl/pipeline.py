"""Module 1.2/1.3 — Load transformed records into the staging warehouse."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.entities import (
    AuditEvent,
    ExtractionLog,
    ExtractionRun,
    ExtractionStatus,
    StagingTransaction,
    TransactionChannel as DbChannel,
)
from app.schemas.compliance import RawTransaction, TransactionChannel
from app.services.etl.extractor import FinacleExtractor
from app.services.etl.oracle_client import get_oracledb
from app.services.etl.oracle_source import OracleFinacleSource
from app.services.etl.transformer import TransactionTransformer

logger = logging.getLogger(__name__)


class ETLPipeline:
    """Orchestrates extract → transform → load for Milestone 1."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.extractor = FinacleExtractor()
        self.transformer = TransactionTransformer()

    async def run(
        self,
        channels: list[TransactionChannel] | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        actor_name: str = "System",
    ) -> ExtractionRun:
        """Synchronous run (scheduler / tests) — blocks until complete."""
        run = await self.start_run(channels, date_from, date_to)
        await self.execute_run(run.id, channels, date_from, date_to, actor_name)
        await self.db.refresh(run)
        return run

    async def start_run(
        self,
        channels: list[TransactionChannel] | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> ExtractionRun:
        channel_values = [c.value for c in (channels or FinacleExtractor.ALL_CHANNELS)]
        run = ExtractionRun(
            status=ExtractionStatus.RUNNING,
            channels=channel_values,
            date_from=date_from,
            date_to=date_to,
        )
        self.db.add(run)
        await self.db.flush()

        mode = settings_mode()
        await self._log(run.id, "INFO", None, f"Starting extraction from Finacle ({mode})")
        if date_from and date_to:
            await self._log(
                run.id,
                "INFO",
                None,
                f"Date range: {date_from.isoformat()} → {date_to.isoformat()}",
            )
        elif mode == "oracle":
            await self._log(
                run.id,
                "INFO",
                None,
                f"Oracle source: {settings.finacle_oracle_source} "
                f"(default window: last {settings.finacle_oracle_default_days} day(s) — no dates in request)",
            )
        else:
            await self._log(run.id, "INFO", None, f"Channels: {', '.join(channel_values)}")

        if mode == "oracle" and settings.finacle_oracle_source.lower() == "htd":
            await self._log(
                run.id,
                "INFO",
                None,
                "Chunked mode: one day at a time — progress saved after each day; duplicates skipped",
            )

        await self.db.commit()
        await self.db.refresh(run)
        return run

    async def execute_run(
        self,
        run_id: str,
        channels: list[TransactionChannel] | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        actor_name: str = "System",
    ) -> None:
        result = await self.db.execute(select(ExtractionRun).where(ExtractionRun.id == run_id))
        run = result.scalar_one()
        channel_values = run.channels or []

        try:
            mode = settings_mode()
            if mode == "oracle" and settings.finacle_oracle_source.lower() == "htd":
                await self._run_oracle_htd_by_day(run, date_from, date_to)
            else:
                raw_records = await self.extractor.extract(channels, date_from, date_to)
                await self._log(run.id, "INFO", None, f"Extracted {len(raw_records)} raw records")
                new, skipped, valid, invalid = await self._load_records(run.id, raw_records)
                run.records_extracted = new
                run.records_valid = valid
                run.records_invalid = invalid
                if skipped:
                    await self._log(run.id, "INFO", None, f"Skipped {skipped} duplicate finacle_ref(s)")

            await self._finalize_run(run, channel_values, actor_name)
            await self.db.commit()

        except Exception as exc:
            run.status = ExtractionStatus.FAILED
            run.completed_at = datetime.now(timezone.utc)
            run.error_summary = str(exc)
            await self._log(run.id, "ERROR", None, str(exc))
            await self.db.commit()
            raise

    async def _run_oracle_htd_by_day(
        self,
        run: ExtractionRun,
        date_from: datetime | None,
        date_to: datetime | None,
    ) -> None:
        source = OracleFinacleSource()
        start_naive, end_exclusive = source._resolve_dates(date_from, date_to)
        oracledb = get_oracledb()
        days = list(source.iter_day_windows(start_naive, end_exclusive))
        total_new = total_skipped = total_valid = total_invalid = 0

        await self._log(run.id, "INFO", None, f"Processing {len(days)} day(s) from Oracle HTD")

        for index, (day_start, day_end) in enumerate(days, start=1):
            day_label = day_start.date().isoformat()
            await self._log(run.id, "INFO", None, f"[{index}/{len(days)}] Fetching {day_label}…")

            raw_records = await asyncio.to_thread(
                source.extract_htd_window,
                day_start,
                day_end,
                oracledb,
            )
            new, skipped, valid, invalid = await self._load_records(run.id, raw_records)
            total_new += new
            total_skipped += skipped
            total_valid += valid
            total_invalid += invalid

            run.records_extracted = total_new
            run.records_valid = total_valid
            run.records_invalid = total_invalid

            await self._log(
                run.id,
                "INFO",
                None,
                f"[{index}/{len(days)}] {day_label}: {len(raw_records)} mapped, "
                f"{new} loaded, {skipped} duplicates skipped",
            )
            await self.db.commit()

        if total_new == 0 and len(days) > 0:
            await self._log(
                run.id,
                "WARN",
                None,
                "No new rows loaded — widen the date range or check HTD MIN/MAX dates in Oracle",
            )
        elif total_skipped:
            await self._log(
                run.id,
                "INFO",
                None,
                f"Total duplicates skipped (already in staging): {total_skipped}",
            )

    async def _load_records(
        self,
        run_id: str,
        raw_records: list[RawTransaction],
    ) -> tuple[int, int, int, int]:
        """Load records; returns (new, skipped_duplicates, valid, invalid)."""
        if not raw_records:
            return 0, 0, 0, 0

        existing: set[str] = set()
        if settings.etl_skip_duplicates:
            refs = [r.finacle_ref for r in raw_records]
            result = await self.db.execute(
                select(StagingTransaction.finacle_ref).where(StagingTransaction.finacle_ref.in_(refs))
            )
            existing = set(result.scalars().all())

        seen: set[str] = set()
        new = skipped = valid = invalid = 0

        for raw in raw_records:
            if settings.etl_skip_duplicates and (
                raw.finacle_ref in existing or raw.finacle_ref in seen
            ):
                skipped += 1
                continue
            seen.add(raw.finacle_ref)

            payload, is_valid, errors = self.transformer.transform(raw)
            if not is_valid:
                invalid += 1
                await self._log(
                    run_id,
                    "WARN",
                    raw.channel.value,
                    f"{raw.finacle_ref}: {'; '.join(errors)}",
                )
            else:
                valid += 1

            self.db.add(
                StagingTransaction(
                    extraction_run_id=run_id,
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
                    is_valid=is_valid,
                    validation_errors=errors or None,
                    reportable_ctr=payload["reportFlags"]["CTR"],
                    reportable_ftr=payload["reportFlags"]["FTR"],
                    reportable_pep=payload["reportFlags"]["PEP"],
                    reportable_str=payload["reportFlags"]["STR"],
                    nfiu_payload=payload,
                )
            )
            new += 1

        await self.db.flush()
        return new, skipped, valid, invalid

    async def _finalize_run(
        self,
        run: ExtractionRun,
        channel_values: list[str],
        actor_name: str,
    ) -> None:
        run.completed_at = datetime.now(timezone.utc)
        run.status = (
            ExtractionStatus.SUCCESS
            if run.records_invalid == 0
            else ExtractionStatus.PARTIAL
            if run.records_valid > 0
            else ExtractionStatus.FAILED
        )
        if run.records_invalid:
            run.error_summary = f"{run.records_invalid} records failed validation"

        await self._log(
            run.id,
            "INFO",
            None,
            f"Load complete — {run.records_valid} valid, {run.records_invalid} invalid, "
            f"{run.records_extracted} new records",
        )

        self.db.add(
            AuditEvent(
                actor_name=actor_name,
                action="ETL_COMPLETED",
                entity_type="extraction_run",
                entity_id=run.id,
                details={
                    "records_extracted": run.records_extracted,
                    "records_valid": run.records_valid,
                    "records_invalid": run.records_invalid,
                    "channels": channel_values,
                    "date_from": run.date_from.isoformat() if run.date_from else None,
                    "date_to": run.date_to.isoformat() if run.date_to else None,
                },
            )
        )

    async def _log(
        self, run_id: str, level: str, channel: str | None, message: str
    ) -> None:
        self.db.add(
            ExtractionLog(run_id=run_id, level=level, channel=channel, message=message)
        )
        await self.db.flush()


def settings_mode() -> str:
    return settings.finacle_mode
