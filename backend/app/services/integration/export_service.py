"""Pull translated staging transactions for Nova middleware / NFIU filing."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import and_, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import RegulatoryReport, ReportType, StagingTransaction, TransactionChannel
from app.schemas.integration import (
    ExportMeta,
    ExportedReportSummary,
    ExportedTransaction,
    ExportReportsResponse,
    ExportSummaryResponse,
    ExportTransactionsResponse,
    ReportFlags,
)


class ExportService:
    """Serve NFIU-ready translated transactions to authenticated API partners."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def verify_client(self, client_name: str, key_prefix: str) -> dict:
        return {
            "status": "ok",
            "client_name": client_name,
            "key_prefix": key_prefix,
            "scopes": ["export:read"],
            "message": "API key valid — you may pull translated transactions.",
        }

    async def summary(
        self,
        period_start: datetime,
        period_end: datetime,
    ) -> ExportSummaryResponse:
        base = self._period_filters(period_start, period_end)
        total = await self._count(select(StagingTransaction).where(*base, StagingTransaction.is_valid.is_(True)))
        ctr = await self._count(
            select(StagingTransaction).where(*base, StagingTransaction.is_valid.is_(True), StagingTransaction.reportable_ctr.is_(True))
        )
        ftr = await self._count(
            select(StagingTransaction).where(*base, StagingTransaction.is_valid.is_(True), StagingTransaction.reportable_ftr.is_(True))
        )
        pep = await self._count(
            select(StagingTransaction).where(*base, StagingTransaction.is_valid.is_(True), StagingTransaction.reportable_pep.is_(True))
        )
        str_count = await self._count(
            select(StagingTransaction).where(*base, StagingTransaction.is_valid.is_(True), StagingTransaction.reportable_str.is_(True))
        )
        return ExportSummaryResponse(
            period_start=period_start,
            period_end=period_end,
            total_valid=total,
            ctr_eligible=ctr,
            ftr_eligible=ftr,
            pep_eligible=pep,
            str_eligible=str_count,
            generated_at=datetime.now(timezone.utc),
        )

    async def list_transactions(
        self,
        period_start: datetime,
        period_end: datetime,
        report_type: ReportType | None = None,
        valid_only: bool = True,
        channel: TransactionChannel | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> ExportTransactionsResponse:
        filters = list(self._period_filters(period_start, period_end))
        if valid_only:
            filters.append(StagingTransaction.is_valid.is_(True))
        if channel:
            filters.append(StagingTransaction.channel == channel)
        if report_type:
            filters.append(self._flag_column(report_type).is_(True))

        count_stmt = select(func.count()).select_from(StagingTransaction).where(and_(*filters))
        total = await self._scalar(count_stmt)

        stmt = (
            select(StagingTransaction)
            .where(and_(*filters))
            .order_by(desc(StagingTransaction.transaction_date), StagingTransaction.finacle_ref)
            .offset(offset)
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        rows = list(result.scalars().all())

        return ExportTransactionsResponse(
            meta=ExportMeta(
                period_start=period_start,
                period_end=period_end,
                report_type=report_type.value if report_type else None,
                total_matching=total,
                returned=len(rows),
                offset=offset,
                limit=limit,
                generated_at=datetime.now(timezone.utc),
            ),
            transactions=[self._serialize(tx) for tx in rows],
        )

    async def get_transaction(self, finacle_ref: str) -> ExportedTransaction | None:
        result = await self.db.execute(
            select(StagingTransaction).where(StagingTransaction.finacle_ref == finacle_ref)
        )
        row = result.scalar_one_or_none()
        return self._serialize(row) if row else None

    async def list_reports(
        self,
        period_start: datetime | None = None,
        period_end: datetime | None = None,
        report_type: ReportType | None = None,
        limit: int = 50,
    ) -> ExportReportsResponse:
        stmt = select(RegulatoryReport).order_by(desc(RegulatoryReport.created_at)).limit(limit)
        if report_type:
            stmt = stmt.where(RegulatoryReport.report_type == report_type)
        if period_start:
            stmt = stmt.where(RegulatoryReport.period_end >= period_start)
        if period_end:
            stmt = stmt.where(RegulatoryReport.period_start <= period_end)

        result = await self.db.execute(stmt)
        reports = result.scalars().all()
        return ExportReportsResponse(
            reports=[
                ExportedReportSummary(
                    id=r.id,
                    report_type=r.report_type.value,
                    status=r.status.value,
                    period_start=r.period_start,
                    period_end=r.period_end,
                    record_count=r.record_count,
                    created_at=r.created_at,
                    has_xml=bool(r.xml_path),
                    has_csv=bool(r.csv_path),
                )
                for r in reports
            ],
            returned=len(reports),
        )

    async def read_report_file(self, report_id: str, fmt: str) -> tuple[str, str, str] | None:
        result = await self.db.execute(select(RegulatoryReport).where(RegulatoryReport.id == report_id))
        report = result.scalar_one_or_none()
        if not report:
            return None

        if fmt == "csv":
            path = report.csv_path
            media = "text/csv"
            filename = f"{report.report_type.value}_{report.id[:8]}.csv"
        else:
            path = report.xml_path
            media = "application/xml"
            filename = f"{report.report_type.value}_{report.id[:8]}.xml"

        if not path or not Path(path).is_file():
            return None

        return Path(path).read_text(encoding="utf-8"), media, filename

    def _serialize(self, tx: StagingTransaction) -> ExportedTransaction:
        payload = tx.nfiu_payload or {}
        return ExportedTransaction(
            id=tx.id,
            finacle_ref=tx.finacle_ref,
            channel=tx.channel.value,
            transaction_date=tx.transaction_date,
            amount=tx.amount,
            currency=tx.currency,
            sender_name=tx.sender_name,
            sender_account=tx.sender_account,
            receiver_name=tx.receiver_name,
            receiver_account=tx.receiver_account or "",
            branch_code=tx.branch_code,
            narration=tx.narration,
            is_valid=tx.is_valid,
            validation_errors=tx.validation_errors,
            report_flags=ReportFlags(
                ctr=tx.reportable_ctr,
                ftr=tx.reportable_ftr,
                pep=tx.reportable_pep,
                str=tx.reportable_str,
            ),
            nfiu_payload=payload,
        )

    def _period_filters(self, period_start: datetime, period_end: datetime) -> list:
        return [
            StagingTransaction.transaction_date >= period_start,
            StagingTransaction.transaction_date <= period_end,
        ]

    def _flag_column(self, report_type: ReportType):
        return {
            ReportType.CTR: StagingTransaction.reportable_ctr,
            ReportType.FTR: StagingTransaction.reportable_ftr,
            ReportType.PEP: StagingTransaction.reportable_pep,
            ReportType.STR: StagingTransaction.reportable_str,
        }[report_type]

    async def _count(self, stmt) -> int:
        return await self._scalar(stmt)

    async def _scalar(self, stmt) -> int:
        result = await self.db.execute(stmt)
        return result.scalar_one() or 0
