from datetime import datetime, timezone

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import (
    AuditEvent,
    ExtractionRun,
    RegulatoryReport,
    ReportStatus,
    StagingTransaction,
)
from app.schemas.compliance import DataQualityMetrics


class AnalyticsService:
    """Data quality metrics and dashboard aggregations."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_data_quality(self) -> DataQualityMetrics:
        total = await self._scalar(select(func.count()).select_from(StagingTransaction))
        valid = await self._scalar(
            select(func.count()).select_from(StagingTransaction).where(StagingTransaction.is_valid.is_(True))
        )
        invalid = total - valid

        channel_rows = await self.db.execute(
            select(StagingTransaction.channel, func.count())
            .group_by(StagingTransaction.channel)
        )
        by_channel = {row[0].value: row[1] for row in channel_rows.all()}

        ctr = await self._scalar(
            select(func.count())
            .select_from(StagingTransaction)
            .where(StagingTransaction.reportable_ctr.is_(True))
        )
        ftr = await self._scalar(
            select(func.count())
            .select_from(StagingTransaction)
            .where(StagingTransaction.reportable_ftr.is_(True))
        )
        pep = await self._scalar(
            select(func.count())
            .select_from(StagingTransaction)
            .where(StagingTransaction.reportable_pep.is_(True))
        )
        str_count = await self._scalar(
            select(func.count())
            .select_from(StagingTransaction)
            .where(StagingTransaction.reportable_str.is_(True))
        )

        last_run = await self.db.execute(
            select(ExtractionRun.completed_at)
            .where(ExtractionRun.completed_at.is_not(None))
            .order_by(desc(ExtractionRun.completed_at))
            .limit(1)
        )
        last_extraction = last_run.scalar_one_or_none()

        rate = round((valid / total * 100) if total else 100.0, 1)
        return DataQualityMetrics(
            total_records=total,
            valid_records=valid,
            invalid_records=invalid,
            validation_rate=rate,
            by_channel=by_channel,
            ctr_eligible=ctr,
            ftr_eligible=ftr,
            pep_eligible=pep,
            str_eligible=str_count,
            last_extraction_at=last_extraction,
        )

    async def _scalar(self, stmt) -> int:
        result = await self.db.execute(stmt)
        return result.scalar_one() or 0


class AuditService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def log(
        self,
        actor_name: str,
        action: str,
        entity_type: str,
        entity_id: str,
        details: dict | None = None,
        actor_id: str | None = None,
    ) -> AuditEvent:
        event = AuditEvent(
            actor_id=actor_id,
            actor_name=actor_name,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            details=details,
        )
        self.db.add(event)
        await self.db.commit()
        await self.db.refresh(event)
        return event

    async def list_recent(self, limit: int = 20) -> list[AuditEvent]:
        result = await self.db.execute(
            select(AuditEvent).order_by(desc(AuditEvent.created_at)).limit(limit)
        )
        return list(result.scalars().all())


class ReportWorkflowService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.audit = AuditService(db)

    async def approve(self, report_id: str, actor_name: str) -> RegulatoryReport:
        report = await self._get(report_id)
        report.status = ReportStatus.APPROVED
        await self.audit.log(actor_name, "REPORT_APPROVED", "regulatory_report", report_id)
        await self.db.commit()
        await self.db.refresh(report)
        return report

    async def submit(self, report_id: str, actor_name: str) -> RegulatoryReport:
        report = await self._get(report_id)
        if report.status not in (ReportStatus.APPROVED, ReportStatus.DRAFT):
            raise ValueError("Report must be approved before submission")
        report.status = ReportStatus.SUBMITTED
        report.submitted_at = datetime.now(timezone.utc)
        report.submitted_to = "NFIU goAML Portal"
        await self.audit.log(
            actor_name,
            "REPORT_SUBMITTED",
            "regulatory_report",
            report_id,
            {"submitted_to": report.submitted_to},
        )
        await self.db.commit()
        await self.db.refresh(report)
        return report

    async def reject(self, report_id: str, actor_name: str, notes: str | None = None) -> RegulatoryReport:
        report = await self._get(report_id)
        report.status = ReportStatus.REJECTED
        await self.audit.log(
            actor_name,
            "REPORT_REJECTED",
            "regulatory_report",
            report_id,
            {"notes": notes},
        )
        await self.db.commit()
        await self.db.refresh(report)
        return report

    async def _get(self, report_id: str) -> RegulatoryReport:
        result = await self.db.execute(
            select(RegulatoryReport).where(RegulatoryReport.id == report_id)
        )
        report = result.scalar_one_or_none()
        if not report:
            raise ValueError("Report not found")
        return report
