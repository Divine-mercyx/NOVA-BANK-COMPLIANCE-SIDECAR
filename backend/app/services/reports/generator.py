"""Module 1.4 — Reporting Engine.

Generates NFIU-compliant XML and CSV files for CTR, FTR, and PEP reports.
"""

from datetime import datetime, timezone
from pathlib import Path
from xml.etree.ElementTree import Element, SubElement, tostring

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.entities import (
    AuditEvent,
    RegulatoryReport,
    ReportStatus,
    ReportType,
    StagingTransaction,
)


class ReportGenerator:
    """Build regulatory report files from staged warehouse data."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.output_dir = Path(settings.reports_output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    async def generate(
        self,
        report_type: ReportType,
        period_start: datetime,
        period_end: datetime,
        actor_name: str = "Compliance Officer",
    ) -> RegulatoryReport:
        transactions = await self._fetch_transactions(report_type, period_start, period_end)

        report = RegulatoryReport(
            report_type=report_type,
            status=ReportStatus.DRAFT,
            period_start=period_start,
            period_end=period_end,
            record_count=len(transactions),
            preview_data={
                "sample": [
                    {
                        "ref": t.finacle_ref,
                        "channel": t.channel.value,
                        "amount": t.amount,
                        "currency": t.currency,
                        "sender": t.sender_name,
                        "receiver": t.receiver_name,
                    }
                    for t in transactions[:5]
                ],
                "totals": {
                    "count": len(transactions),
                    "total_amount": round(sum(t.amount for t in transactions), 2),
                },
            },
        )
        self.db.add(report)
        await self.db.flush()

        stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        base_name = f"{report_type.value}_{stamp}"
        xml_path = self.output_dir / f"{base_name}.xml"
        csv_path = self.output_dir / f"{base_name}.csv"

        xml_path.write_text(self._build_xml(report_type, transactions, period_start, period_end), encoding="utf-8")
        csv_path.write_text(self._build_csv(transactions), encoding="utf-8")

        report.xml_path = str(xml_path)
        report.csv_path = str(csv_path)

        self.db.add(
            AuditEvent(
                actor_name=actor_name,
                action="REPORT_GENERATED",
                entity_type="regulatory_report",
                entity_id=report.id,
                details={"report_type": report_type.value, "record_count": len(transactions)},
            )
        )
        await self.db.commit()
        await self.db.refresh(report)
        return report

    async def _fetch_transactions(
        self, report_type: ReportType, period_start: datetime, period_end: datetime
    ) -> list[StagingTransaction]:
        flag_column = {
            ReportType.CTR: StagingTransaction.reportable_ctr,
            ReportType.FTR: StagingTransaction.reportable_ftr,
            ReportType.PEP: StagingTransaction.reportable_pep,
            ReportType.STR: StagingTransaction.reportable_str,
        }[report_type]

        result = await self.db.execute(
            select(StagingTransaction).where(
                and_(
                    flag_column.is_(True),
                    StagingTransaction.is_valid.is_(True),
                    StagingTransaction.transaction_date >= period_start,
                    StagingTransaction.transaction_date <= period_end,
                )
            )
        )
        return list(result.scalars().all())

    def _build_xml(
        self,
        report_type: ReportType,
        transactions: list[StagingTransaction],
        period_start: datetime,
        period_end: datetime,
    ) -> str:
        root = Element("goAMLReport")
        root.set("xmlns", "urn:nfiu:goaml:v1")
        SubElement(root, "reportingEntity").text = "NOVA_BANK_NG"
        SubElement(root, "reportType").text = report_type.value
        SubElement(root, "periodStart").text = period_start.isoformat()
        SubElement(root, "periodEnd").text = period_end.isoformat()
        SubElement(root, "recordCount").text = str(len(transactions))

        transactions_el = SubElement(root, "transactions")
        for tx in transactions:
            tx_el = SubElement(transactions_el, "transaction")
            SubElement(tx_el, "reference").text = tx.finacle_ref
            SubElement(tx_el, "date").text = tx.transaction_date.isoformat()
            SubElement(tx_el, "channel").text = tx.channel.value
            SubElement(tx_el, "amount").text = str(tx.amount)
            SubElement(tx_el, "currency").text = tx.currency
            SubElement(tx_el, "originatorName").text = tx.sender_name
            SubElement(tx_el, "originatorAccount").text = tx.sender_account
            SubElement(tx_el, "beneficiaryName").text = tx.receiver_name
            SubElement(tx_el, "beneficiaryAccount").text = tx.receiver_account
            if report_type == ReportType.PEP:
                SubElement(tx_el, "pepFlag").text = "true"
            if report_type == ReportType.STR:
                SubElement(tx_el, "suspiciousActivityFlag").text = "true"

        return '<?xml version="1.0" encoding="UTF-8"?>\n' + tostring(root, encoding="unicode")

    def _build_csv(self, transactions: list[StagingTransaction]) -> str:
        lines = [
            "reference,date,channel,amount,currency,sender,sender_account,receiver,branch,pep_flag,str_flag"
        ]
        for tx in transactions:
            lines.append(
                f"{tx.finacle_ref},{tx.transaction_date.isoformat()},{tx.channel.value},"
                f"{tx.amount},{tx.currency},\"{tx.sender_name}\",{tx.sender_account},"
                f"\"{tx.receiver_name}\",{tx.branch_code},{tx.reportable_pep},{tx.reportable_str}"
            )
        return "\n".join(lines) + "\n"
