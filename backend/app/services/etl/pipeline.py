"""Module 1.2/1.3 — Load transformed records into the staging warehouse."""

from __future__ import annotations

import asyncio
import json
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
from app.services.etl.customer_registry import CustomerRegistry
from app.services.etl.extractor import FinacleExtractor
from app.services.etl.htd_mapper import map_htd_rows
from app.services.etl.oracle_client import get_oracledb
from app.services.etl.oracle_source import (
    HTD_BETWEEN_PAGES_SEC,
    HtdDayCursor,
    OracleFinacleSource,
)
from app.services.etl.transformer import TransactionTransformer

logger = logging.getLogger("nova.etl")


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
                "One Oracle session per 50-row page: fetch, close, stage, then reconnect. No COUNT.",
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
                incomplete_error, skipped = await self._run_oracle_htd_by_day(run, date_from, date_to)
                await self._finalize_run(
                    run,
                    channel_values,
                    actor_name,
                    incomplete_error=incomplete_error,
                    skipped=skipped,
                )
            else:
                raw_records = await self.extractor.extract(channels, date_from, date_to)
                await self._log(run.id, "INFO", None, f"Extracted {len(raw_records)} raw records")
                new, skipped, valid, invalid = await self._load_records(run.id, raw_records)
                run.records_extracted = new
                run.records_valid = valid
                run.records_invalid = invalid
                if skipped:
                    await self._log(run.id, "INFO", None, f"Skipped {skipped} duplicate finacle_ref(s)")
                await self._finalize_run(run, channel_values, actor_name, skipped=skipped)

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
    ) -> tuple[str | None, int]:
        source = OracleFinacleSource()
        start_naive, end_exclusive = source._resolve_dates(date_from, date_to)
        await self._log(run.id, "INFO", None, "Loading Oracle Instant Client…")
        await self.db.commit()
        oracledb = get_oracledb()
        days = list(source.iter_day_windows(start_naive, end_exclusive))
        total_new = total_skipped = total_valid = total_invalid = 0
        incomplete_error: str | None = None

        await self._log(run.id, "INFO", None, f"Processing {len(days)} day(s) from Oracle HTD")
        await self.db.commit()
        customers = CustomerRegistry.default()
        banks = source.fetch_bank_directory(oracledb, settings.finacle_admin_schema)

        for index, (day_start, day_end) in enumerate(days, start=1):
            day_label = day_start.date().isoformat()
            cursor = HtdDayCursor()
            day_new = day_skipped = 0
            day_mapped = 0

            while not cursor.done:
                page_no = cursor.pages_fetched + 1
                logger.info(
                    "[HTD %s] %s opening Oracle for page %s%s",
                    run.id[:8],
                    day_label,
                    page_no,
                    f" after TRAN_ID={cursor.last_id}" if cursor.last_id else "",
                )
                await self._log(
                    run.id,
                    "INFO",
                    None,
                    f"[{index}/{len(days)}] {day_label}: opening Oracle for page {page_no}"
                    + (f" after TRAN_ID={cursor.last_id}" if cursor.last_id else "")
                    + " — session closes before staging",
                )
                await self.db.commit()
                try:
                    flush_rows, cursor = await asyncio.to_thread(
                        source.fetch_htd_flush_page,
                        oracledb,
                        settings.finacle_admin_schema,
                        day_start,
                        day_end,
                        cursor,
                    )
                except Exception as exc:
                    incomplete_error = str(exc)
                    logger.error(
                        "[HTD %s] %s page %s Oracle failed: %s",
                        run.id[:8],
                        day_label,
                        page_no,
                        exc,
                    )
                    await self._log(
                        run.id,
                        "ERROR",
                        None,
                        f"Oracle dropped on page {page_no}: {exc}. "
                        f"Already staged pages are kept ({total_new} new, {total_skipped} already in staging). "
                        "Re-run the same dates to continue; duplicates are skipped.",
                    )
                    await self.db.commit()
                    break

                logger.info(
                    "[HTD %s] %s page %s fetched: %s HTD legs to map (%s leftover held), Oracle session closed",
                    run.id[:8],
                    day_label,
                    cursor.pages_fetched or page_no,
                    len(flush_rows),
                    len(cursor.leftover),
                )

                raw_records = map_htd_rows(flush_rows, customers, banks) if flush_rows else []
                logger.info(
                    "[HTD %s] %s page %s mapped: %s HTD legs → %s transactions",
                    run.id[:8],
                    day_label,
                    cursor.pages_fetched or page_no,
                    len(flush_rows),
                    len(raw_records),
                )

                new = skipped = valid = invalid = 0
                if raw_records:
                    new, skipped, valid, invalid = await self._load_records(run.id, raw_records)
                logger.info(
                    "[HTD %s] %s page %s staged: %s new, %s already in warehouse, %s valid, %s invalid",
                    run.id[:8],
                    day_label,
                    cursor.pages_fetched or page_no,
                    new,
                    skipped,
                    valid,
                    invalid,
                )

                day_new += new
                day_skipped += skipped
                day_mapped += len(raw_records)
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
                    self._htd_progress_message(
                        day=day_label,
                        day_index=index,
                        days=len(days),
                        page=cursor.pages_fetched,
                        legs_fetched=cursor.legs_fetched,
                        legs_total=None,
                        staged=total_new,
                        skipped=total_skipped,
                        invalid=total_invalid,
                        valid=total_valid,
                    ),
                )
                await self.db.commit()
                logger.info(
                    "[HTD %s] %s page %s committed: run totals new=%s already_staged=%s valid=%s invalid=%s legs=%s done=%s",
                    run.id[:8],
                    day_label,
                    cursor.pages_fetched or page_no,
                    total_new,
                    total_skipped,
                    total_valid,
                    total_invalid,
                    cursor.legs_fetched,
                    cursor.done,
                )
                if not cursor.done:
                    logger.info(
                        "[HTD %s] %s waiting %ss before next Oracle connect",
                        run.id[:8],
                        day_label,
                        HTD_BETWEEN_PAGES_SEC,
                    )
                    await asyncio.sleep(HTD_BETWEEN_PAGES_SEC)

            if incomplete_error:
                break

            await self._log(
                run.id,
                "INFO",
                None,
                f"[{index}/{len(days)}] {day_label}: {day_mapped} mapped, "
                f"{day_new} loaded, {day_skipped} already in staging",
            )
            await self.db.commit()

        if incomplete_error:
            return incomplete_error, total_skipped
        if total_new == 0 and len(days) > 0:
            await self._log(
                run.id,
                "WARN",
                None,
                "No new rows loaded — they may already be in staging, or HTD has no rows for this range",
            )
        elif total_skipped:
            await self._log(
                run.id,
                "INFO",
                None,
                f"Total already in staging (skipped duplicates): {total_skipped}",
            )
        return None, total_skipped

    @staticmethod
    def _htd_progress_message(
        *,
        day: str,
        day_index: int,
        days: int,
        page: int,
        legs_fetched: int,
        legs_total: int | None,
        staged: int,
        skipped: int,
        invalid: int,
        valid: int,
    ) -> str:
        payload = {
            "kind": "htd_progress",
            "day": day,
            "day_index": day_index,
            "days": days,
            "page": page,
            "legs_fetched": legs_fetched,
            "legs_total": legs_total,
            "staged": staged,
            "skipped": skipped,
            "invalid": invalid,
            "valid": valid,
        }
        legs = f"{legs_fetched}/{legs_total}" if legs_total is not None else str(legs_fetched)
        return (
            f"PROGRESS {json.dumps(payload, separators=(',', ':'))} "
            f"{day_index}/{days} {day} page {page} · {legs} HTD legs → {staged} transactions "
            f"(entered {staged}, already in staging {skipped}, invalid {invalid})"
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
        *,
        incomplete_error: str | None = None,
        skipped: int = 0,
    ) -> None:
        run.completed_at = datetime.now(timezone.utc)
        if incomplete_error:
            run.error_summary = incomplete_error
            made_progress = run.records_extracted > 0 or run.records_valid > 0 or skipped > 0
            run.status = ExtractionStatus.PARTIAL if made_progress else ExtractionStatus.FAILED
        elif run.records_invalid == 0:
            run.status = ExtractionStatus.SUCCESS
        elif run.records_valid > 0:
            run.status = ExtractionStatus.PARTIAL
        else:
            run.status = ExtractionStatus.FAILED
            run.error_summary = f"{run.records_invalid} records failed validation"

        if run.records_invalid and not incomplete_error:
            run.error_summary = f"{run.records_invalid} records failed validation"

        await self._log(
            run.id,
            "INFO",
            None,
            f"Load complete — {run.records_valid} valid, {run.records_invalid} invalid, "
            f"{run.records_extracted} new, {skipped} already in staging"
            + ("; Oracle stopped early" if incomplete_error else ""),
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
                    "records_skipped": skipped,
                    "incomplete": bool(incomplete_error),
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
