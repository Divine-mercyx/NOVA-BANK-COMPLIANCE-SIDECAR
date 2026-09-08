"""Module 1.2/1.3 — Load transformed records into the staging warehouse."""

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import (
    AuditEvent,
    ExtractionLog,
    ExtractionRun,
    ExtractionStatus,
    StagingTransaction,
    TransactionChannel as DbChannel,
)
from app.schemas.compliance import TransactionChannel
from app.schemas.compliance import RawTransaction
from app.services.etl.extractor import FinacleExtractor
from app.services.etl.transformer import TransactionTransformer


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
        channel_values = [c.value for c in (channels or FinacleExtractor.ALL_CHANNELS)]
        run = ExtractionRun(
            status=ExtractionStatus.RUNNING,
            channels=channel_values,
        )
        self.db.add(run)
        await self.db.flush()

        mode = settings_mode()
        await self._log(run.id, "INFO", None, f"Starting extraction from Finacle ({mode})")
        if mode == "oracle":
            from app.core.config import settings

            await self._log(
                run.id,
                "INFO",
                None,
                f"Oracle source: {settings.finacle_oracle_source} "
                f"(default window: last {settings.finacle_oracle_default_days} day(s) if no dates sent)",
            )
        if date_from or date_to:
            await self._log(
                run.id,
                "INFO",
                None,
                f"Date range: {date_from.isoformat() if date_from else '…'} → {date_to.isoformat() if date_to else '…'}",
            )
        elif mode != "oracle":
            await self._log(run.id, "INFO", None, f"Channels: {', '.join(channel_values)}")

        try:
            raw_records = await self.extractor.extract(channels, date_from, date_to)
            await self._log(run.id, "INFO", None, f"Extracted {len(raw_records)} raw records")
            if len(raw_records) == 0 and mode == "oracle":
                await self._log(
                    run.id,
                    "WARN",
                    None,
                    "Oracle returned 0 rows — widen FINACLE_ORACLE_DEFAULT_DAYS or check "
                    "SELECT MIN(NVL(PSTD_DATE,TRAN_DATE)), MAX(NVL(PSTD_DATE,TRAN_DATE)) FROM TBAADM.HTD",
                )

            valid_count = 0
            invalid_count = 0

            for raw in raw_records:
                payload, is_valid, errors = self.transformer.transform(raw)
                if not is_valid:
                    invalid_count += 1
                    await self._log(
                        run.id,
                        "WARN",
                        raw.channel.value,
                        f"{raw.finacle_ref}: {'; '.join(errors)}",
                    )
                else:
                    valid_count += 1

                staging = StagingTransaction(
                    extraction_run_id=run.id,
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
                self.db.add(staging)

            run.records_extracted = len(raw_records)
            run.records_valid = valid_count
            run.records_invalid = invalid_count
            run.completed_at = datetime.now(timezone.utc)
            run.status = (
                ExtractionStatus.SUCCESS
                if invalid_count == 0
                else ExtractionStatus.PARTIAL
                if valid_count > 0
                else ExtractionStatus.FAILED
            )
            if invalid_count:
                run.error_summary = f"{invalid_count} records failed validation"

            await self._log(run.id, "INFO", None, f"Load complete — {valid_count} valid, {invalid_count} invalid")

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
                    },
                )
            )
            await self.db.commit()
            await self.db.refresh(run)
            return run

        except Exception as exc:
            run.status = ExtractionStatus.FAILED
            run.completed_at = datetime.now(timezone.utc)
            run.error_summary = str(exc)
            await self._log(run.id, "ERROR", None, str(exc))
            await self.db.commit()
            raise

    async def _log(
        self, run_id: str, level: str, channel: str | None, message: str
    ) -> None:
        self.db.add(
            ExtractionLog(run_id=run_id, level=level, channel=channel, message=message)
        )
        await self.db.flush()


def settings_mode() -> str:
    from app.core.config import settings

    return settings.finacle_mode
