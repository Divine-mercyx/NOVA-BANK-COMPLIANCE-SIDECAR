"""Pull translated staging transactions for Nova middleware / NFIU filing."""

from __future__ import annotations

from datetime import date as date_type, datetime, timezone
from pathlib import Path

from typing import Literal

from sqlalchemy import and_, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.entities import DtdTransaction, RegulatoryReport, ReportType, StagingTransaction, TransactionChannel
from app.schemas.integration import (
    DtdExportMeta,
    DtdExportResponse,
    DtdTransactionOut,
    ExportMeta,
    ExportedReportSummary,
    ExportReportsResponse,
    ExportSummaryResponse,
    NfiuTransactionRow,
    NfiuTransactionsResponse,
)
from app.services.etl.dtd_pipeline import lagos_day_bounds
from app.services.integration.ctr_nfiu import map_nfiu_row

EXPORT_UNBOUNDED_CAP = 50_000


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
        total = await self._count(*base, StagingTransaction.is_valid.is_(True))
        ctr = await self._count(
            *base,
            StagingTransaction.is_valid.is_(True),
            StagingTransaction.reportable_ctr.is_(True),
        )
        ftr = await self._count(
            *base,
            StagingTransaction.is_valid.is_(True),
            StagingTransaction.reportable_ftr.is_(True),
        )
        pep = await self._count(
            *base,
            StagingTransaction.is_valid.is_(True),
            StagingTransaction.reportable_pep.is_(True),
        )
        str_count = await self._count(
            *base,
            StagingTransaction.is_valid.is_(True),
            StagingTransaction.reportable_str.is_(True),
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
        valid_only: bool = False,
        channel: TransactionChannel | None = None,
        limit: int | None = None,
        offset: int = 0,
        scope: Literal["all", "ctr"] = "all",
    ) -> NfiuTransactionsResponse:
        filters = list(self._period_filters(period_start, period_end))
        if valid_only:
            filters.append(StagingTransaction.is_valid.is_(True))
        if channel:
            filters.append(StagingTransaction.channel == channel)
        if scope == "ctr":
            filters.append(StagingTransaction.currency == "NGN")
            filters.append(StagingTransaction.amount >= settings.ctr_threshold_ngn)
        elif report_type:
            filters.append(self._flag_column(report_type).is_(True))

        count_stmt = select(func.count()).select_from(StagingTransaction).where(and_(*filters))
        total = await self._scalar(count_stmt)

        stmt = (
            select(StagingTransaction)
            .where(and_(*filters))
            .order_by(desc(StagingTransaction.transaction_date), StagingTransaction.finacle_ref)
            .offset(offset)
        )
        applied_limit = min(limit, EXPORT_UNBOUNDED_CAP) if limit is not None else EXPORT_UNBOUNDED_CAP
        stmt = stmt.limit(applied_limit)
        result = await self.db.execute(stmt)
        rows = list(result.scalars().all())

        meta = ExportMeta(
            period_start=period_start,
            period_end=period_end,
            report_type="CTR" if scope == "ctr" else (report_type.value if report_type else None),
            scope=scope,
            ctr_threshold_ngn=settings.ctr_threshold_ngn if scope == "ctr" else None,
            total_matching=total,
            returned=len(rows),
            offset=offset,
            limit=limit,
            generated_at=datetime.now(timezone.utc),
        )
        return NfiuTransactionsResponse(meta=meta, transactions=[map_nfiu_row(tx) for tx in rows])

    async def get_transaction(self, finacle_ref: str) -> NfiuTransactionRow | None:
        result = await self.db.execute(
            select(StagingTransaction).where(StagingTransaction.finacle_ref == finacle_ref)
        )
        row = result.scalar_one_or_none()
        return map_nfiu_row(row) if row else None

    async def list_dtd(
        self,
        day: date_type,
        limit: int | None = None,
        offset: int = 0,
    ) -> DtdExportResponse:
        business_start, _, _ = lagos_day_bounds(day)
        filters = [DtdTransaction.business_date == business_start]
        count_stmt = select(func.count()).select_from(DtdTransaction).where(and_(*filters))
        total = await self._scalar(count_stmt)
        stmt = (
            select(DtdTransaction)
            .where(and_(*filters))
            .order_by(desc(DtdTransaction.transaction_date), DtdTransaction.finacle_ref)
            .offset(offset)
        )
        applied = min(limit, EXPORT_UNBOUNDED_CAP) if limit is not None else EXPORT_UNBOUNDED_CAP
        stmt = stmt.limit(applied)
        result = await self.db.execute(stmt)
        rows = list(result.scalars().all())
        return DtdExportResponse(
            meta=DtdExportMeta(
                business_date=day,
                total_matching=total,
                returned=len(rows),
                offset=offset,
                limit=limit,
                generated_at=datetime.now(timezone.utc),
            ),
            transactions=[DtdTransactionOut.model_validate(r) for r in rows],
        )

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

    async def _count(self, *filters) -> int:
        stmt = select(func.count()).select_from(StagingTransaction).where(and_(*filters))
        return await self._scalar(stmt)

    async def _scalar(self, stmt) -> int:
        result = await self.db.execute(stmt)
        return result.scalar_one() or 0
