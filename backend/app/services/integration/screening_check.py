"""Synchronous screening check for Nova middleware."""

from __future__ import annotations

import time
from difflib import SequenceMatcher
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.entities import AlertStatus, AuditEvent, ScreeningAlert, ScreeningType
from app.schemas.integration import ScreeningCheckRequest, ScreeningCheckResponse, ScreeningMatch
from app.services.etl.pep_registry import PepRegistry

WATCHLIST_SOURCES = [
    "PEP Registry",
    "Internal Watchlist",
    "Global Sanctions List",
    "Nigeria Sanctions List",
]

SANCTIONS_KEYWORDS = [
    ("hassan ibrahim", "Global Sanctions List"),
    ("shell nigeria", "Internal Watchlist"),
    ("politically exposed person", "PEP Registry"),
]


class ScreeningCheckService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.pep = PepRegistry.from_csv(Path(settings.finacle_samples_dir) / "PEP_CUSTOMERS.csv")

    async def check(self, body: ScreeningCheckRequest, client_name: str) -> ScreeningCheckResponse:
        started = time.perf_counter()
        matches: list[ScreeningMatch] = []

        for name in (body.sender_name, body.receiver_name):
            matches.extend(self._match_name(name))

        if self.pep.is_pep_name(body.sender_name):
            matches.append(ScreeningMatch(watchlist_source="PEP Registry", matched_name=body.sender_name, match_score=95.0))
        if self.pep.is_pep_name(body.receiver_name):
            matches.append(ScreeningMatch(watchlist_source="PEP Registry", matched_name=body.receiver_name, match_score=95.0))

        latency_ms = int((time.perf_counter() - started) * 1000)
        decision = "review" if matches else "clear"
        alert_id = None

        if decision == "review":
            top = max(matches, key=lambda m: m.match_score)
            alert = ScreeningAlert(
                finacle_ref=body.finacle_ref,
                screening_type=ScreeningType.TRANSACTION,
                status=AlertStatus.PENDING,
                sender_name=body.sender_name,
                receiver_name=body.receiver_name,
                amount=body.amount,
                currency=body.currency,
                channel=body.channel,
                watchlist_source=top.watchlist_source,
                matched_name=top.matched_name,
                match_score=top.match_score,
                latency_ms=latency_ms,
            )
            self.db.add(alert)
            await self.db.flush()
            alert_id = alert.id

        self.db.add(
            AuditEvent(
                actor_name=client_name,
                action="SCREENING_CHECK",
                entity_type="screening_check",
                entity_id=body.finacle_ref,
                details={"decision": decision, "match_count": len(matches), "latency_ms": latency_ms},
            )
        )
        await self.db.commit()

        return ScreeningCheckResponse(
            decision=decision,
            finacle_ref=body.finacle_ref,
            matches=matches,
            latency_ms=latency_ms,
            alert_id=alert_id,
        )

    def _match_name(self, name: str) -> list[ScreeningMatch]:
        upper = (name or "").strip().upper()
        if not upper:
            return []
        found: list[ScreeningMatch] = []
        for keyword, source in SANCTIONS_KEYWORDS:
            score = SequenceMatcher(None, upper, keyword.upper()).ratio() * 100
            if score >= 72 or keyword.upper() in upper:
                found.append(ScreeningMatch(watchlist_source=source, matched_name=name, match_score=round(score, 1)))
        return found
