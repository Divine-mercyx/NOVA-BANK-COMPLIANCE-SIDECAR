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


def _read_csv(path: Path) -> list[dict]:
    with path.open(newline="", encoding="utf-8-sig") as fh:
        return list(csv.DictReader(fh))
