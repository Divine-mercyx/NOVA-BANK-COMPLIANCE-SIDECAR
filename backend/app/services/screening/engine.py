from datetime import datetime, timezone
from random import choice, randint, uniform

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import AlertStatus, AuditEvent, ScreeningAlert, ScreeningType

WATCHLIST_SOURCES = [
    "Global Sanctions List",
    "Nigeria Sanctions List",
    "PEP Registry",
    "Internal Watchlist",
    "BVN Watchlist",
    "OFAC SDN",
    "UN Consolidated List",
]

MOCK_NAMES = [
    ("Adebayo Okonkwo", "Hassan Ibrahim", "Global Sanctions List"),
    ("Chioma Eze", "Politically Exposed Person", "PEP Registry"),
    ("John Smith", "Shell Nigeria", "Internal Watchlist"),
    ("Fatima Bello", "Amina Yusuf", "Nigeria Sanctions List"),
]

CHANNELS = ["NIP", "SWIFT", "RTGS", "NEFT", "MOBILE"]


class ScreeningService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def simulate_alerts(self, count: int = 5, actor_name: str = "System") -> list[ScreeningAlert]:
        alerts: list[ScreeningAlert] = []
        for i in range(count):
            sender, receiver, source = choice(MOCK_NAMES)
            matched = choice([sender, receiver])
            alert = ScreeningAlert(
                finacle_ref=f"SCR-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{i:03d}",
                screening_type=choice(list(ScreeningType)),
                status=AlertStatus.PENDING,
                sender_name=sender,
                receiver_name=receiver,
                amount=round(uniform(100_000, 25_000_000), 2),
                currency=choice(["NGN", "NGN", "USD"]),
                channel=choice(CHANNELS),
                watchlist_source=source,
                matched_name=matched,
                match_score=round(uniform(72, 99), 1),
                latency_ms=randint(8, 45),
            )
            self.db.add(alert)
            alerts.append(alert)

        self.db.add(
            AuditEvent(
                actor_name=actor_name,
                action="SCREENING_SIMULATED",
                entity_type="screening",
                entity_id="batch",
                details={"count": count},
            )
        )
        await self.db.commit()
        for a in alerts:
            await self.db.refresh(a)
        return alerts

    async def list_alerts(self, status: AlertStatus | None = None, limit: int = 50) -> list[ScreeningAlert]:
        stmt = select(ScreeningAlert).order_by(desc(ScreeningAlert.created_at)).limit(limit)
        if status:
            stmt = stmt.where(ScreeningAlert.status == status)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_alert(self, alert_id: str) -> ScreeningAlert | None:
        result = await self.db.execute(select(ScreeningAlert).where(ScreeningAlert.id == alert_id))
        return result.scalar_one_or_none()

    async def resolve(
        self,
        alert_id: str,
        status: AlertStatus,
        actor_name: str,
        notes: str | None = None,
    ) -> ScreeningAlert:
        alert = await self.get_alert(alert_id)
        if not alert:
            raise ValueError("Alert not found")
        alert.status = status
        alert.reviewed_by = actor_name
        alert.reviewed_at = datetime.now(timezone.utc)
        alert.notes = notes

        action_map = {
            AlertStatus.APPROVED: "ALERT_APPROVED",
            AlertStatus.REJECTED: "ALERT_REJECTED",
            AlertStatus.ESCALATED: "ALERT_ESCALATED",
        }
        self.db.add(
            AuditEvent(
                actor_name=actor_name,
                action=action_map[status],
                entity_type="screening_alert",
                entity_id=alert_id,
                details={"finacle_ref": alert.finacle_ref, "notes": notes},
            )
        )
        await self.db.commit()
        await self.db.refresh(alert)
        return alert

    async def dashboard_stats(self) -> dict:
        pending = await self._count(AlertStatus.PENDING)
        total = await self._count(None)
        escalated = await self._count(AlertStatus.ESCALATED)
        approved = await self._count(AlertStatus.APPROVED)
        rejected = await self._count(AlertStatus.REJECTED)

        latency = await self.db.execute(select(func.avg(ScreeningAlert.latency_ms)))
        avg_latency = round(latency.scalar_one() or 0, 1)

        resolved = approved + rejected
        false_positive_rate = round((approved / resolved * 100) if resolved else 0, 1)

        return {
            "pending_alerts": pending,
            "total_screened_today": total,
            "escalated": escalated,
            "avg_latency_ms": avg_latency,
            "false_positive_rate": false_positive_rate,
            "resolved_today": resolved,
        }

    async def performance_metrics(self) -> dict:
        by_source = await self.db.execute(
            select(ScreeningAlert.watchlist_source, func.count())
            .group_by(ScreeningAlert.watchlist_source)
        )
        by_status = await self.db.execute(
            select(ScreeningAlert.status, func.count()).group_by(ScreeningAlert.status)
        )
        latency_rows = await self.db.execute(
            select(ScreeningAlert.latency_ms).order_by(desc(ScreeningAlert.created_at)).limit(20)
        )
        return {
            "by_watchlist": {row[0]: row[1] for row in by_source.all()},
            "by_status": {row[0].value: row[1] for row in by_status.all()},
            "recent_latency_ms": [r[0] for r in latency_rows.all()],
        }

    async def _count(self, status: AlertStatus | None) -> int:
        stmt = select(func.count()).select_from(ScreeningAlert)
        if status:
            stmt = stmt.where(ScreeningAlert.status == status)
        result = await self.db.execute(stmt)
        return result.scalar_one() or 0
