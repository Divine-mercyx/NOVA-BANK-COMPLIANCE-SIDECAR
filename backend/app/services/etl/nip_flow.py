"""NIP institution enrichment via APIUSER.NIP_OUT_FLW / NIP_IN_FLW."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.schemas.compliance import RawTransaction

# NIBSS institution code for Nova on in/out flow tables (not vendor 60003).
NOVA_NIBSS_INSTITUTION_CODE = "060003"


def collect_tran_ids_from_legs(rows: list[dict[str, Any]]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for row in rows:
        tid = str(row.get("tran_id") or row.get("TRAN_ID") or "").strip()
        if tid and tid not in seen:
            seen.add(tid)
            out.append(tid)
    return out


def _amount_key(amount: Any) -> float:
    try:
        return round(float(amount or 0), 2)
    except (TypeError, ValueError):
        return 0.0


def _flow_key(tran_id: str, amount: Any) -> tuple[str, float]:
    return (tran_id.strip().upper(), _amount_key(amount))


def _norm_code(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


@dataclass
class NipFlowLookup:
    """Outbound (CBS_TRAN_ID) and inbound (POSTING_TRAN_ID) NIP rows keyed by tran_id + amount."""

    outbound: dict[tuple[str, float], tuple[str | None, str | None]] = field(default_factory=dict)
    inbound: dict[tuple[str, float], tuple[str | None, str | None]] = field(default_factory=dict)
    names: dict[str, str] = field(default_factory=dict)

    @classmethod
    def empty(cls) -> NipFlowLookup:
        return cls()

    def resolve_name(self, code: str | None) -> str | None:
        if not code:
            return None
        if code in self.names:
            return self.names[code]
        stripped = code.lstrip("0") or "0"
        if stripped in self.names:
            return self.names[stripped]
        padded = code.zfill(6)
        if padded in self.names:
            return self.names[padded]
        if code == NOVA_NIBSS_INSTITUTION_CODE:
            return self.names.get(code) or "Nova Bank"
        return None

    def apply(self, tx: RawTransaction, tran_id: str) -> None:
        key = _flow_key(tran_id, tx.amount)
        if key in self.outbound:
            orig, dest = self.outbound[key]
            self._set_source(tx, orig or NOVA_NIBSS_INSTITUTION_CODE)
            self._set_dest(tx, dest)
        elif key in self.inbound:
            orig, dest = self.inbound[key]
            self._set_source(tx, orig)
            self._set_dest(tx, dest or NOVA_NIBSS_INSTITUTION_CODE)

    def _set_source(self, tx: RawTransaction, code: str | None) -> None:
        if not code or tx.source_institution_code is not None:
            return
        tx.source_institution_code = code
        tx.source_institution_name = self.resolve_name(code)

    def _set_dest(self, tx: RawTransaction, code: str | None) -> None:
        if not code or tx.dest_institution_code is not None:
            return
        tx.dest_institution_code = code
        tx.dest_institution_name = self.resolve_name(code)


def register_outbound_row(
    store: dict[tuple[str, float], tuple[str | None, str | None]],
    tran_id: str,
    amount: Any,
    originator: str | None,
    destination: str | None,
) -> None:
    key = _flow_key(tran_id, amount)
    pair = (_norm_code(originator), _norm_code(destination))
    existing = store.get(key)
    if existing is None or (pair[1] and not existing[1]):
        store[key] = pair


def register_inbound_row(
    store: dict[tuple[str, float], tuple[str | None, str | None]],
    tran_id: str,
    amount: Any,
    originator: str | None,
    destination: str | None,
) -> None:
    key = _flow_key(tran_id, amount)
    pair = (_norm_code(originator), _norm_code(destination))
    existing = store.get(key)
    if existing is None or (pair[0] and not existing[0]):
        store[key] = pair
