"""Vendor export endpoints are NIP-only."""

from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.integration_deps import get_api_client
from app.api.routes import integration
from app.core.database import get_db
from app.models.entities import TransactionChannel
from app.schemas.integration import ExportMeta, NfiuTransactionsResponse


def _client(monkeypatch, calls: list[dict]) -> TestClient:
    async def fake_list_transactions(self, period_start, period_end, **kwargs):
        calls.append(kwargs)
        channel = kwargs.get("channel")
        return NfiuTransactionsResponse(
            meta=ExportMeta(
                period_start=period_start,
                period_end=period_end,
                scope=kwargs.get("scope", "all"),
                channel=channel.value if channel else None,
                total_matching=0,
                returned=0,
                offset=kwargs.get("offset", 0),
                limit=kwargs.get("limit"),
                generated_at=datetime.now(timezone.utc),
            ),
            transactions=[],
        )

    monkeypatch.setattr(integration.ExportService, "list_transactions", fake_list_transactions)
    app = FastAPI()
    app.include_router(integration.partner_router)
    app.dependency_overrides[get_api_client] = lambda: object()
    app.dependency_overrides[get_db] = lambda: None
    return TestClient(app)


def test_transactions_export_is_restricted_to_nip(monkeypatch):
    calls: list[dict] = []
    res = _client(monkeypatch, calls).get(
        "/api/v1/export/transactions",
        params={"date_from": "2026-10-01", "date_to": "2026-10-17"},
    )
    assert res.status_code == 200
    assert calls[0]["channel"] is TransactionChannel.NIP
    assert res.json()["meta"]["channel"] == "NIP"


def test_ctr_export_is_restricted_to_nip(monkeypatch):
    calls: list[dict] = []
    res = _client(monkeypatch, calls).get(
        "/api/v1/export/transactions/ctr",
        params={"date_from": "2026-10-01", "date_to": "2026-10-17"},
    )
    assert res.status_code == 200
    assert calls[0]["channel"] is TransactionChannel.NIP
    assert calls[0]["scope"] == "ctr"
    assert res.json()["meta"]["channel"] == "NIP"
