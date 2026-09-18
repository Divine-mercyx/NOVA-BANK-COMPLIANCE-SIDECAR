"""Resolve source/dest institution from DTD BANK_CODE (CBN/NIBSS when present)."""

from __future__ import annotations

from typing import Any

NOVA_INSTITUTION_CODE = "60003"
NOVA_INSTITUTION_NAME = "NOVA BANK"

# CBN/NIBSS sort codes. Finacle BANK_ID "01" in Nova's DTD dump is the own-bank entity, not CBN.
CBN_INSTITUTIONS: dict[str, str] = {
    "01": NOVA_INSTITUTION_NAME,
    "011": "FIRST BANK OF NIGERIA",
    "023": "CITIBANK NIGERIA",
    "032": "UNION BANK OF NIGERIA",
    "033": "UNITED BANK FOR AFRICA",
    "035": "WEMA BANK",
    "044": "ACCESS BANK",
    "050": "ECOBANK NIGERIA",
    "057": "ZENITH BANK",
    "058": "GTBANK",
    "068": "STANDARD CHARTERED BANK NIGERIA",
    "070": "FIDELITY BANK",
    "076": "POLARIS BANK",
    "082": "KEYSTONE BANK",
    "084": "ENTERPRISE BANK",
    "100": "SUNTRUST BANK",
    "101": "PROVIDUS BANK",
    "102": "TITAN TRUST BANK",
    "103": "GLOBUS BANK",
    "214": "FCMB",
    "215": "UNITY BANK",
    "221": "STANBIC IBTC BANK",
    "232": "STERLING BANK",
    "301": "JAIZ BANK",
    "302": "TAJ BANK",
    "303": "LOTUS BANK",
    "526": "PARALLEX BANK",
    "608": "FINATRUST MFB",
    "60003": NOVA_INSTITUTION_NAME,
}


def _cell(row: dict[str, Any], *keys: str) -> str:
    for key in keys:
        value = row.get(key)
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return ""


def resolve_institution(row: dict[str, Any] | None) -> tuple[str, str]:
    """Debit or credit DTD leg → CBN code + name.

    BANK_CODE is the counterpart/own-bank code when Finacle fills it.
    On the Nova sample dump every row has BANK_CODE blank and BANK_ID=01
    (own-book posting) — treat that as Nova.
    """
    if not row:
        return NOVA_INSTITUTION_CODE, NOVA_INSTITUTION_NAME

    code = _cell(row, "bank_code", "BANK_CODE")
    if not code:
        return NOVA_INSTITUTION_CODE, NOVA_INSTITUTION_NAME

    if code in ("01", "1") or code.upper() in ("NOVA", "NOVA BANK"):
        return NOVA_INSTITUTION_CODE, NOVA_INSTITUTION_NAME

    padded = code.zfill(3) if code.isdigit() and len(code) < 3 else code
    name = CBN_INSTITUTIONS.get(code) or CBN_INSTITUTIONS.get(padded)
    if name == NOVA_INSTITUTION_NAME:
        return NOVA_INSTITUTION_CODE, NOVA_INSTITUTION_NAME
    if name:
        return code, name
    return code, f"BANK {code}"
