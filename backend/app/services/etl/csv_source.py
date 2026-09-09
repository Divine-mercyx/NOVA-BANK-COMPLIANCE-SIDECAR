"""Extract transactions from exported Finacle CSV samples (offline / UAT)."""

from __future__ import annotations

import csv
from datetime import datetime
from pathlib import Path

from app.core.config import settings
from app.schemas.compliance import RawTransaction, TransactionChannel
from app.services.etl.finacle_mappers import (
    account_label,
    map_cashless,
    map_niptrans,
    map_rtgstran,
    map_withdrawal_rows,
)
from app.services.etl.customer_registry import CustomerRegistry
from app.services.etl.htd_mapper import map_htd_rows


class CsvFinacleSource:
    TABLE_FILES = {
        TransactionChannel.NIP: "NIPTRANS.csv",
        TransactionChannel.RTGS: "RTGSTRAN.csv",
        TransactionChannel.MOBILE: "CASHLESS_TRAN_TABLE.csv",
        TransactionChannel.CASH_WITHDRAWAL: "WITHDRAWAL_TRAN_TBL.csv",
    }

    def __init__(self, samples_dir: str | None = None) -> None:
        self.samples_dir = Path(samples_dir or settings.finacle_samples_dir)
        self.customers = CustomerRegistry.default()

    def extract(
        self,
        channels: list[TransactionChannel] | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> list[RawTransaction]:
        htd_path = self.samples_dir / "HTD.csv"
        if htd_path.is_file() and settings.finacle_oracle_source.lower() == "htd":
            return self._extract_htd_csv(htd_path, date_from, date_to)

        selected = channels or list(self.TABLE_FILES.keys())
        records: list[RawTransaction] = []

        for channel in selected:
            filename = self.TABLE_FILES.get(channel)
            if not filename:
                continue
            path = self.samples_dir / filename
            if not path.is_file():
                continue
            rows = _read_csv(path)
            if channel == TransactionChannel.CASH_WITHDRAWAL:
                mapped = map_withdrawal_rows(rows)
            elif channel == TransactionChannel.NIP:
                mapped = [map_niptrans(r, self.customers) for r in rows]
            elif channel == TransactionChannel.RTGS:
                mapped = [map_rtgstran(r, self.customers) for r in rows]
            elif channel == TransactionChannel.MOBILE:
                mapped = [map_cashless(r) for r in rows]
            else:
                mapped = []

            for tx in mapped:
                if date_from and tx.transaction_date < date_from:
                    continue
                if date_to and tx.transaction_date > date_to:
                    continue
                records.append(tx)

        return records

    def _extract_htd_csv(
        self,
        path: Path,
        date_from: datetime | None,
        date_to: datetime | None,
    ) -> list[RawTransaction]:
        rows = _read_csv(path)
        mapped = map_htd_rows(rows, self.customers)
        if not date_from and not date_to:
            return mapped
        out: list[RawTransaction] = []
        for tx in mapped:
            if date_from and tx.transaction_date < date_from:
                continue
            if date_to and tx.transaction_date > date_to:
                continue
            out.append(tx)
        return out


def _read_csv(path: Path) -> list[dict]:
    with path.open(newline="", encoding="utf-8-sig") as fh:
        return list(csv.DictReader(fh))
