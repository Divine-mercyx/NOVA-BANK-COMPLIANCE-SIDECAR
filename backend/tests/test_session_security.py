"""Cookie sessions, CSRF double-submit and live change hints."""

import asyncio
import json
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.api import deps
from app.core.config import settings
from app.core.events import EventBus, _collect
from app.core.security import create_access_token, decode_access_token, generate_csrf_token
from app.models.entities import AuditEvent, ExtractionLog


def _request(method: str, cookie: str | None = None, csrf_header: str | None = None) -> Request:
    headers = []
    if cookie:
        headers.append((b"cookie", f"{settings.session_cookie_name}={cookie}".encode()))
    if csrf_header is not None:
        headers.append((b"x-csrf-token", csrf_header.encode()))
    return Request({"type": "http", "method": method, "path": "/api/v1/x", "headers": headers, "query_string": b""})


@pytest.fixture
def session(monkeypatch):
    csrf = generate_csrf_token()
    token = create_access_token("user-1", "a@novabank.ng", "admin", csrf)
    user = SimpleNamespace(id="user-1", is_active=True)

    async def fake_resolve(raw, _db):
        return (user, decode_access_token(raw)) if raw == token else None

    monkeypatch.setattr(deps, "user_from_session_token", fake_resolve)
    return token, csrf, user


def test_token_carries_csrf_claim():
    csrf = generate_csrf_token()
    payload = decode_access_token(create_access_token("u", "e@x.ng", "viewer", csrf))
    assert payload["csrf"] == csrf


def test_missing_cookie_is_401(session):
    with pytest.raises(HTTPException) as err:
        asyncio.run(deps.get_current_user(_request("GET"), db=None))
    assert err.value.status_code == 401


def test_bearer_header_alone_is_not_accepted(session):
    token, _, _ = session
    request = Request(
        {"type": "http", "method": "GET", "path": "/", "headers": [(b"authorization", f"Bearer {token}".encode())], "query_string": b""}
    )
    with pytest.raises(HTTPException) as err:
        asyncio.run(deps.get_current_user(request, db=None))
    assert err.value.status_code == 401


def test_safe_method_needs_no_csrf(session):
    token, _, user = session
    assert asyncio.run(deps.get_current_user(_request("GET", token), db=None)) is user


@pytest.mark.parametrize("header", [None, "", "wrong"])
def test_unsafe_method_without_matching_csrf_is_403(session, header):
    token, _, _ = session
    with pytest.raises(HTTPException) as err:
        asyncio.run(deps.get_current_user(_request("POST", token, header), db=None))
    assert err.value.status_code == 403


def test_unsafe_method_with_matching_csrf_passes(session):
    token, csrf, user = session
    assert asyncio.run(deps.get_current_user(_request("DELETE", token, csrf), db=None)) is user


def test_flush_collects_topics_and_ids_only():
    audit = AuditEvent(id="a1", actor_name="x", action="LOGIN_SUCCESS", entity_type="user", entity_id="u")
    log = ExtractionLog(id="l1", run_id="run-9", message="m")
    fake_session = SimpleNamespace(info={}, new=[audit, log], dirty=[])
    _collect(fake_session, None)
    assert fake_session.info["nova_live_changes"] == {"audit": {"a1"}, "extraction.log": {"run-9"}}


def test_bus_falls_back_to_in_process_delivery_without_redis():
    async def run():
        bus = EventBus()  # never started: no Redis connection
        queue = bus.subscribe()
        await bus.publish({"type": "change", "changes": {"audit": ["a1"]}})
        return json.loads(queue.get_nowait())

    assert asyncio.run(run()) == {"type": "change", "changes": {"audit": ["a1"]}}
