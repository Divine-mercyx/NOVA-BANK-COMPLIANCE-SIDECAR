"""Authenticator-app codes, sealed keys and recovery-code hashes. No database needed."""

import pytest

from app.core import totp
from app.core.secret_box import SecretBoxError, open_sealed, recovery_hash, seal

# RFC 6238, appendix B: the SHA-1 secret is the ASCII text 12345678901234567890. Expected codes are the RFC's
# 8-digit values cut to the last six digits (6-digit codes are the same number modulo 10^6).
RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
RFC_VECTORS = [
    (59, "287082"),
    (1111111109, "081804"),
    (1111111111, "050471"),
    (1234567890, "005924"),
    (2000000000, "279037"),
    (20000000000, "353130"),
]


@pytest.mark.parametrize("unix_time, expected", RFC_VECTORS)
def test_codes_match_the_rfc_test_vectors(unix_time, expected):
    assert totp.code_at(RFC_SECRET, totp.step_at(unix_time)) == expected


def test_a_code_is_accepted_and_reports_its_step():
    now = 1234567890
    assert totp.verify(RFC_SECRET, "005924", now) == totp.step_at(now)


def test_one_step_of_clock_drift_is_accepted_two_are_not():
    now = 1234567890
    step = totp.step_at(now)
    assert totp.verify(RFC_SECRET, totp.code_at(RFC_SECRET, step - 1), now) == step - 1
    assert totp.verify(RFC_SECRET, totp.code_at(RFC_SECRET, step + 1), now) == step + 1
    assert totp.verify(RFC_SECRET, totp.code_at(RFC_SECRET, step - 2), now) is None
    assert totp.verify(RFC_SECRET, totp.code_at(RFC_SECRET, step + 2), now) is None


def test_a_code_cannot_be_used_twice():
    now = 1234567890
    step = totp.verify(RFC_SECRET, "005924", now)
    assert step is not None
    assert totp.verify(RFC_SECRET, "005924", now, last_used_step=step) is None
    # A code for a later step still works.
    later = totp.code_at(RFC_SECRET, step + 1)
    assert totp.verify(RFC_SECRET, later, now + 30, last_used_step=step) == step + 1


@pytest.mark.parametrize("bad", ["", "12345", "1234567", "abcdef", "00 59 24x", None])
def test_codes_that_are_not_six_digits_are_refused(bad):
    assert totp.verify(RFC_SECRET, bad, 1234567890) is None


def test_spaces_in_a_typed_code_are_ignored():
    assert totp.verify(RFC_SECRET, "005 924", 1234567890) is not None


def test_new_secrets_are_random_160_bit_base32_and_work():
    a, b = totp.new_secret(), totp.new_secret()
    assert a != b and len(a) == 32 and set(a) <= set("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567")
    now = 1_800_000_000
    assert totp.verify(a, totp.code_at(a, totp.step_at(now)), now) is not None


def test_a_key_typed_by_hand_still_works():
    typed = " ".join(RFC_SECRET[i : i + 4] for i in range(0, len(RFC_SECRET), 4)).lower()
    assert totp.code_at(typed, 1) == totp.code_at(RFC_SECRET, 1)


def test_the_otpauth_link_has_what_an_authenticator_app_reads():
    url = totp.otpauth_url("ABC234", "ada@novabank.ng", "Nova Compliance")
    assert url.startswith("otpauth://totp/Nova%20Compliance:ada%40novabank.ng?")
    for part in ("secret=ABC234", "issuer=Nova+Compliance", "algorithm=SHA1", "digits=6", "period=30"):
        assert part in url


def test_a_sealed_key_opens_and_is_not_readable():
    sealed = seal("JBSWY3DPEHPK3PXP")
    assert "JBSWY3DPEHPK3PXP" not in sealed and sealed.startswith("v1:")
    assert open_sealed(sealed) == "JBSWY3DPEHPK3PXP"
    assert seal("JBSWY3DPEHPK3PXP") != sealed  # a fresh random nonce each time


def test_a_changed_or_foreign_sealed_key_is_refused():
    sealed = seal("JBSWY3DPEHPK3PXP")
    tampered = sealed[:-4] + ("AAAA" if not sealed.endswith("AAAA") else "BBBB")
    with pytest.raises(SecretBoxError):
        open_sealed(tampered)
    with pytest.raises(SecretBoxError):
        open_sealed("plain-text")


def test_the_key_comes_from_the_setting_and_a_different_key_cannot_open_it(monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "two_factor_key", "11" * 32)
    sealed = seal("SECRET")
    assert open_sealed(sealed) == "SECRET"
    monkeypatch.setattr(settings, "two_factor_key", "22" * 32)
    with pytest.raises(SecretBoxError):
        open_sealed(sealed)


def test_recovery_hashes_ignore_case_and_dashes_and_depend_on_the_key(monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "two_factor_key", "11" * 32)
    assert recovery_hash("K7M2P-9XQ4D-HT3WA") == recovery_hash("k7m2p9xq4dht3wa")
    assert recovery_hash("K7M2P-9XQ4D-HT3WA") != recovery_hash("K7M2P-9XQ4D-HT3WB")
    first = recovery_hash("K7M2P-9XQ4D-HT3WA")
    monkeypatch.setattr(settings, "two_factor_key", "22" * 32)
    assert recovery_hash("K7M2P-9XQ4D-HT3WA") != first
