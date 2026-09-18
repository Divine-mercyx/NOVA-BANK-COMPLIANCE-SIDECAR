"""Resolve source/dest institution from DTD BANK_CODE + TBAADM.BANK_CODE_TABLE."""

from __future__ import annotations

from typing import Any


def _cell(row: dict[str, Any], *keys: str) -> str:
    for key in keys:
        value = row.get(key)
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return ""


def _lookup_name(code: str, directory: dict[str, str] | None) -> str | None:
    if not directory:
        return None
    if code in directory:
        return directory[code]
    if code.isdigit():
        padded = code.zfill(3)
        if padded in directory:
            return directory[padded]
        stripped = code.lstrip("0") or "0"
        if stripped in directory:
            return directory[stripped]
    return None


def resolve_institution(
    row: dict[str, Any] | None,
    directory: dict[str, str] | None = None,
) -> tuple[str | None, str | None]:
    """Debit or credit leg → Finacle bank code + BANK_CODE_TABLE name.

    Blank BANK_CODE stays null. Do not invent Nova / 60003.
    """
    if not row:
        return None, None
    code = _cell(row, "bank_code", "BANK_CODE")
    if not code:
        return None, None
    return code, _lookup_name(code, directory)
