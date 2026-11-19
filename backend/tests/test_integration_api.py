"""Integration API — API key creation and export schemas."""

from datetime import datetime, timezone
from uuid import uuid4

import pytest
from pydantic import ValidationError

from fastapi import HTTPException

from app.api.integration_deps import get_api_client
from app.core import security
from app.core.security import API_KEY_LOOKUP_LENGTH, generate_api_key, parse_api_key_lookup, verify_api_key
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


@pytest.mark.parametrize(
    "lookup",
    [
        "abcdefghijk",  # no underscore
        "ab_cdefghij",  # underscore in the middle
        "_abcdefghij",  # at the start
        "abcdefghij_",  # at the end, so the key has "__" before the secret
        "a_b_c_d_e_f",  # several
        "-abc_def-gh",  # hyphens too (also in the urlsafe alphabet)
    ],
)
def test_parse_api_key_lookup_when_lookup_contains_underscore(lookup):
    assert len(lookup) == API_KEY_LOOKUP_LENGTH
    for secret in ("plainsecret", "sec_ret_with_underscores", "_leading", "trailing_"):
        assert parse_api_key_lookup(f"nova_{lookup}_{secret}") == [lookup]


def test_every_generated_key_resolves_to_its_own_lookup(monkeypatch):
    # bcrypt is slow and irrelevant here: only the key format is under test.
    monkeypatch.setattr(security, "hash_api_key", lambda key: "x")
    with_underscore = 0
    for _ in range(5000):
        full_key, lookup, _hash = security.generate_api_key()
        assert len(lookup) == API_KEY_LOOKUP_LENGTH
        assert parse_api_key_lookup(full_key) == [lookup]
        with_underscore += "_" in lookup
    # About 1 key in 6 has an underscore in its lookup: make sure this test really covered that case.
    assert with_underscore > 300


def test_parse_api_key_lookup_other_formats_are_unchanged():
    assert parse_api_key_lookup("") == []
    assert parse_api_key_lookup("notnova_abcdefgh_secret") == []
    assert parse_api_key_lookup("  nova_abcdefghijk_secret  ") == ["abcdefghijk"]
    # legacy key with no underscore after the prefix: first 12 characters
    assert parse_api_key_lookup("nova_abcdefgh1234567") == ["nova_abcdefg"]
    # short lookup from an older key shape: still the part before the first underscore
    assert parse_api_key_lookup("nova_abc12345_secret") == ["abc12345"]


class _FakeKeyDb:
    """Stands in for the database: returns the stored keys whose key_prefix is among the looked-up values."""

    def __init__(self, keys):
        self.keys = keys
        self.committed = False

    async def execute(self, stmt):
        wanted = next(v for k, v in stmt.compile().params.items() if k.startswith("key_prefix"))
        rows = [k for k in self.keys if k.key_prefix in wanted and k.is_active]

        class _Result:
            def scalars(self_inner):
                class _Scalars:
                    def all(self_scalars):
                        return rows

                return _Scalars()

        return _Result()

    async def commit(self):
        self.committed = True


async def test_api_key_with_underscore_in_lookup_authenticates(monkeypatch):
    # Force the case that used to fail: an 11-character lookup that contains "_".
    real = security.token_urlsafe
    monkeypatch.setattr(security, "token_urlsafe", lambda n: "ab_cdef-ghi" if n == 8 else real(n))
    full_key, lookup, key_hash = generate_api_key()
    assert "_" in lookup and full_key.startswith(f"nova_{lookup}_")

    record = ApiKey(id=str(uuid4()), name="Middleware", key_prefix=lookup, key_hash=key_hash, is_active=True,
                    created_at=datetime.now(timezone.utc))
    db = _FakeKeyDb([record])
    client = await get_api_client(x_api_key=full_key, db=db)
    assert client is record
    assert db.committed and record.last_used_at is not None


async def test_wrong_secret_for_key_with_underscore_in_lookup_is_rejected(monkeypatch):
    real = security.token_urlsafe
    monkeypatch.setattr(security, "token_urlsafe", lambda n: "ab_cdef-ghi" if n == 8 else real(n))
    full_key, lookup, key_hash = generate_api_key()
    record = ApiKey(id=str(uuid4()), name="Middleware", key_prefix=lookup, key_hash=key_hash, is_active=True,
                    created_at=datetime.now(timezone.utc))
    with pytest.raises(HTTPException) as err:
        await get_api_client(x_api_key=f"nova_{lookup}_not-the-secret", db=_FakeKeyDb([record]))
    assert err.value.status_code == 401
    # and a revoked key stays rejected
    record.is_active = False
    with pytest.raises(HTTPException) as err:
        await get_api_client(x_api_key=full_key, db=_FakeKeyDb([record]))
    assert err.value.status_code == 401


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
