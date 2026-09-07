"""Customer name lookup for NIP/RTGS / HTD account → name resolution.

Production: TBAADM.GAM (FORACID, ACCT_NAME) joined in Oracle HTD extract.
Offline dev: CUSTOMER_NAMES.csv stub.
"""

from __future__ import annotations

import csv
import re
from pathlib import Path

from app.core.config import settings

ACCOUNT_DIGITS = re.compile(r"\D")


def normalize_account(acct: str) -> str:
    digits = ACCOUNT_DIGITS.sub("", acct or "")
    if len(digits) >= 10:
        return digits[-10:]
    if digits:
        return digits.zfill(10)
    return "0000000000"


class CustomerRegistry:
    """In-memory account → customer name lookup."""

    def __init__(self) -> None:
        self._by_account: dict[str, str] = {}

    @classmethod
    def from_csv(cls, path: Path) -> CustomerRegistry:
        registry = cls()
        if not path.is_file():
            return registry
        with path.open(newline="", encoding="utf-8-sig") as fh:
            for row in csv.DictReader(fh):
                account = normalize_account(row.get("FORACID") or row.get("ACCOUNT") or "")
                name = (row.get("CUSTOMER_NAME") or row.get("NAMES") or row.get("NAME") or "").strip()
                if account != "0000000000" and name:
                    registry._by_account[account] = name
        return registry

    @classmethod
    def default(cls) -> CustomerRegistry:
        return cls.from_csv(Path(settings.finacle_samples_dir) / settings.finacle_customer_names_csv)

    def lookup(self, account: str, fallback: str | None = None) -> str:
        acct = normalize_account(account)
        if acct in self._by_account:
            return self._by_account[acct]
        if fallback and fallback.strip():
            return fallback.strip()
        return f"ACCOUNT {acct}"

    def lookup_or_parse(self, account: str, particular: str | None = None) -> str:
        parsed = parse_particular_name(particular) if particular else None
        return self.lookup(account, fallback=parsed)


def parse_particular_name(particular: str) -> str | None:
    """Extract counterparty name from Finacle TRANPARTICULARS / NARRATIONS."""
    text = (particular or "").strip()
    if not text:
        return None
    upper = text.upper()
    if " BY " in upper:
        return text[upper.rfind(" BY ") + 4 :].strip()
    return None
