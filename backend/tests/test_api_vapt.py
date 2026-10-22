"""API surface VAPT-style checks: auth boundaries, export isolation, path safety.

Run: cd backend && pytest tests/test_api_vapt.py -v
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI, HTTPException, status
from fastapi.testclient import TestClient

from app.api.deps import get_current_user
from app.api.integration_deps import get_api_client
from app.api.routes import auth as auth_routes
from app.api.routes import compliance as compliance_routes
from app.api.routes import dtd as dtd_routes
from app.api.routes import integration as integration_routes
from app.api.routes import screening as screening_routes
from app.core.database import get_db
from app.models.entities import UserRole
from app.services.integration.export_service import ExportService

# --- Staff portal (session cookie + CSRF on writes) ---
STAFF_GET_ROUTES = [
    "/api/v1/dashboard",
    "/api/v1/etl/runs",
    "/api/v1/staging/transactions",
    "/api/v1/analytics/quality",
    "/api/v1/reports",
    "/api/v1/audit",
    "/api/v1/users",
    "/api/v1/dtd/status",
    "/api/v1/screening/dashboard",
    "/api/v1/screening/alerts",
    "/api/v1/integration/info",
    "/api/v1/auth/me",
]

STAFF_WRITE_ROUTES = [
    ("POST", "/api/v1/etl/run", {}),
    ("POST", "/api/v1/dtd/start", None),
    ("POST", "/api/v1/integration/keys", {"name": "x"}),
]

# --- Partner export (X-API-Key only) ---
EXPORT_GET_ROUTES = [
    "/api/v1/export/verify",
    "/api/v1/export/summary?date_from=2026-01-01&date_to=2026-01-01",
    "/api/v1/export/transactions?date_from=2026-01-01&date_to=2026-01-01",
    "/api/v1/export/transactions/ctr?date_from=2026-01-01&date_to=2026-01-01",
    "/api/v1/export/dtd?date=2026-01-01",
    "/api/v1/export/reports",
]

def _staff_app() -> FastAPI:
    app = FastAPI()
    app.include_router(compliance_routes.router)
    app.include_router(dtd_routes.router)
    app.include_router(screening_routes.router)
    app.include_router(integration_routes.router)
    app.include_router(auth_routes.router)
    app.dependency_overrides[get_db] = lambda: MagicMock()
    return app


def _export_app() -> FastAPI:
    app = FastAPI()
    app.include_router(integration_routes.partner_router)
    app.dependency_overrides[get_db] = lambda: MagicMock()
    return app


@pytest.mark.parametrize("path", STAFF_GET_ROUTES)
def test_staff_get_routes_reject_missing_session(path: str):
    client = TestClient(_staff_app())
    res = client.get(path)
    assert res.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.parametrize("method,path,body", STAFF_WRITE_ROUTES)
def test_staff_write_routes_reject_missing_session(method: str, path: str, body: dict | None):
    client = TestClient(_staff_app())
    res = client.request(method, path, json=body)
    assert res.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)


@pytest.mark.parametrize("path", EXPORT_GET_ROUTES)
def test_export_routes_reject_missing_api_key(path: str):
    client = TestClient(_export_app())
    res = client.get(path)
    assert res.status_code == status.HTTP_401_UNAUTHORIZED


def test_export_rejects_malformed_api_key():
    client = TestClient(_export_app())
    res = client.get("/api/v1/export/verify", headers={"X-API-Key": "not-a-nova-key"})
    assert res.status_code == status.HTTP_401_UNAUTHORIZED


def test_auth_login_route_not_behind_staff_router_dependency():
    paths = {getattr(r, "path", "") for r in auth_routes.router.routes}
    assert "/api/v1/auth/login" in paths
    assert "/api/v1/auth/verify-otp" in paths


def test_integration_key_management_requires_admin():
    viewer = SimpleNamespace(
        id="u-viewer",
        email="viewer@novabank.ng",
        full_name="Viewer",
        role=UserRole.VIEWER,
        is_active=True,
    )

    app = _staff_app()

    async def _viewer():
        return viewer

    app.dependency_overrides[get_current_user] = _viewer
    client = TestClient(app)
    res = client.get("/api/v1/integration/keys")
    assert res.status_code == status.HTTP_403_FORBIDDEN


def test_export_verify_does_not_accept_staff_cookie_instead_of_api_key():
    """Export plane must not treat portal session as partner auth."""
    app = _export_app()
    client = TestClient(app)
    res = client.get(
        "/api/v1/export/verify",
        cookies={"nova_session": "fake-jwt"},
    )
    assert res.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.asyncio
async def test_report_download_rejects_path_outside_reports_dir(tmp_path, monkeypatch):
    reports_dir = tmp_path / "reports_output"
    reports_dir.mkdir()
    outside = tmp_path / "secret.txt"
    outside.write_text("leak", encoding="utf-8")

    monkeypatch.setattr("app.services.integration.export_service.settings.reports_output_dir", str(reports_dir))

    report = SimpleNamespace(
        id="r1",
        report_type=SimpleNamespace(value="CTR"),
        csv_path=str(outside),
        xml_path=None,
    )
    db = AsyncMock()
    db.execute = AsyncMock(
        return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=report))
    )
    svc = ExportService(db)
    assert await svc.read_report_file("r1", "csv") is None


@pytest.mark.asyncio
async def test_report_download_reads_file_inside_reports_dir(tmp_path, monkeypatch):
    reports_dir = tmp_path / "reports_output"
    reports_dir.mkdir()
    safe = reports_dir / "ctr.xml"
    safe.write_text("<ok/>", encoding="utf-8")

    monkeypatch.setattr("app.services.integration.export_service.settings.reports_output_dir", str(reports_dir))

    report = SimpleNamespace(
        id="r2",
        report_type=SimpleNamespace(value="CTR"),
        csv_path=None,
        xml_path=str(safe),
    )
    db = AsyncMock()
    db.execute = AsyncMock(
        return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=report))
    )
    svc = ExportService(db)
    content, media, _name = await svc.read_report_file("r2", "xml")
    assert content == "<ok/>"
    assert "xml" in media


def test_get_transaction_export_filters_nip_channel_in_source():
    """Single-ref export must match list/ctr NIP-only contract."""
    import inspect

    source = inspect.getsource(ExportService.get_transaction)
    assert "VENDOR_EXPORT_CHANNEL" in source
