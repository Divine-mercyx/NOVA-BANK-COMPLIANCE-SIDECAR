"""Ingest transactions pushed by Nova middleware."""

from __future__ import annotations

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
from app.schemas.compliance import RawTransaction
from app.schemas.integration import IngestBatchRequest, IngestBatchResponse, IngestRecordResult
from app.services.etl.transformer import TransactionTransformer


class IngestService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.transformer = TransactionTransformer()

    async def ingest_batch(self, body: IngestBatchRequest, client_name: str) -> IngestBatchResponse:
        existing = await self.db.execute(
            select(ExtractionRun).where(ExtractionRun.external_batch_id == body.batch_id)
        )
        prior = existing.scalar_one_or_none()
        if prior:
            return await self._response_from_run(prior, body.batch_id, duplicate=True)

        run = ExtractionRun(
            status=ExtractionStatus.RUNNING,
            source="api_ingest",
            channels=sorted({t.channel.value for t in body.transactions}),
            external_batch_id=body.batch_id,
        )
        self.db.add(run)
        await self.db.flush()

        seen_refs: set[str] = set()
        accepted = rejected = duplicate = 0
        results: list[IngestRecordResult] = []

        for item in body.transactions:
            if item.finacle_ref in seen_refs:
                duplicate += 1
                results.append(IngestRecordResult(finacle_ref=item.finacle_ref, status="duplicate"))
                continue
            seen_refs.add(item.finacle_ref)

            raw = RawTransaction.model_validate(item.model_dump())
            payload, is_valid, errors = self.transformer.transform(raw)
            if is_valid:
                accepted += 1
                status = "accepted"
            else:
                rejected += 1
                status = "rejected"

            self.db.add(
                StagingTransaction(
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
            )
            results.append(
                IngestRecordResult(
                    finacle_ref=item.finacle_ref,
                    status=status,
                    errors=errors or None,
                )
            )

        run.records_extracted = len(body.transactions)
        run.records_valid = accepted
        run.records_invalid = rejected
        run.completed_at = datetime.now(timezone.utc)
        run.status = (
            ExtractionStatus.SUCCESS
            if rejected == 0
            else ExtractionStatus.PARTIAL
            if accepted > 0
            else ExtractionStatus.FAILED
        )
        if rejected:
            run.error_summary = f"{rejected} records failed validation"

        self.db.add(
            ExtractionLog(
                run_id=run.id,
                level="INFO",
                message=f"Ingest batch {body.batch_id} from {client_name}: {accepted} accepted, {rejected} rejected",
            )
        )
        self.db.add(
            AuditEvent(
                actor_name=client_name,
                action="INGEST_BATCH",
                entity_type="ingest_batch",
                entity_id=body.batch_id,
                details={
                    "run_id": run.id,
                    "accepted": accepted,
                    "rejected": rejected,
                    "duplicate": duplicate,
                },
            )
        )
        await self.db.commit()
        await self.db.refresh(run)

        return IngestBatchResponse(
            batch_id=body.batch_id,
            run_id=run.id,
            status=run.status.value,
            accepted=accepted,
            rejected=rejected,
            duplicate=duplicate,
            records=results,
        )

    async def get_batch(self, batch_id: str) -> IngestBatchResponse | None:
        result = await self.db.execute(
            select(ExtractionRun).where(ExtractionRun.external_batch_id == batch_id)
        )
        run = result.scalar_one_or_none()
        if not run:
            return None
        return await self._response_from_run(run, batch_id)

    async def _response_from_run(
        self, run: ExtractionRun, batch_id: str, duplicate: bool = False
    ) -> IngestBatchResponse:
        return IngestBatchResponse(
            batch_id=batch_id,
            run_id=run.id,
            status=run.status.value,
            accepted=run.records_valid,
            rejected=run.records_invalid,
            duplicate=1 if duplicate else 0,
            records=[],
        )
