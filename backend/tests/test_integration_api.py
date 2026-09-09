"""Integration API — API key creation and export schemas."""

from datetime import datetime, timezone
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.core.security import generate_api_key, parse_api_key_lookup, verify_api_key
from app.models.entities import ApiKey
from app.schemas.integration import ApiKeyCreated, ApiKeyOut


def test_generate_api_key_format():
    full_key, prefix, key_hash = generate_api_key()
    assert full_key.startswith("nova_")
    assert full_key.count("_") >= 2
    assert len(prefix) >= 8
    assert verify_api_key(full_key, key_hash)


def test_parse_api_key_lookup_new_format():
    full_key, prefix, _ = generate_api_key()
    assert parse_api_key_lookup(full_key) == [prefix]


def test_api_key_created_includes_secret():
    record = ApiKey(
        id=str(uuid4()),
        name="Middleware",
        key_prefix="abc12345",
        key_hash="hash",
        is_active=True,
        created_at=datetime.now(timezone.utc),
    )
    out = ApiKeyCreated(**ApiKeyOut.model_validate(record).model_dump(), api_key="nova_abc12345_secret")
    assert out.api_key.startswith("nova_")


def test_api_key_created_requires_secret_field():
    record = ApiKey(
        id=str(uuid4()),
        name="Middleware",
        key_prefix="abc12345",
        key_hash="hash",
        is_active=True,
        created_at=datetime.now(timezone.utc),
    )
    with pytest.raises(ValidationError):
        ApiKeyCreated.model_validate(record)
