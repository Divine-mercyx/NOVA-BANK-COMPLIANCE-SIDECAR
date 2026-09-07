"""Load PEP customer list from Finacle CSV export or Oracle."""

from __future__ import annotations

import csv
from pathlib import Path


class PepRegistry:
    """In-memory PEP lookup from CUSTOM.PEP_CUSTOMERS."""

    def __init__(self) -> None:
        self._accounts: set[str] = set()
        self._names: set[str] = set()

    @classmethod
    def from_csv(cls, path: Path) -> PepRegistry:
        registry = cls()
        if not path.is_file():
            return registry
        with path.open(newline="", encoding="utf-8-sig") as fh:
            for row in csv.DictReader(fh):
                foracid = (row.get("FORACID") or "").strip()
                name = (row.get("NAMES") or "").strip().upper()
                if foracid:
                    registry._accounts.add(foracid)
                    registry._accounts.add(_normalize_account(foracid))
                if name:
                    registry._names.add(name)
        return registry

    def is_pep_account(self, account: str) -> bool:
        acct = (account or "").strip()
        return acct in self._accounts or _normalize_account(acct) in self._accounts

    def is_pep_name(self, name: str) -> bool:
        upper = (name or "").strip().upper()
        if not upper:
            return False
        if upper in self._names:
            return True
        return any(pep in upper or upper in pep for pep in self._names if len(pep) > 4)


def _normalize_account(acct: str) -> str:
    digits = "".join(ch for ch in acct if ch.isdigit())
    if len(digits) >= 10:
        return digits[-10:]
    if digits:
        return digits.zfill(10)
    return acct
