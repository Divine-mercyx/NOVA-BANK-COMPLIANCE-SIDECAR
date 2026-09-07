"""Module 1.1 — ETL Extract Layer.

Sources: mock (dev), csv (UAT exports), oracle (live CUSTOM schema).
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from random import choice, randint, uniform

from app.core.config import settings
from app.schemas.compliance import RawTransaction, TransactionChannel
from app.services.etl.csv_source import CsvFinacleSource
from app.services.etl.oracle_source import OracleFinacleSource

MOCK_NAMES = [
    ("Adebayo Okonkwo", "Chioma Eze"),
    ("Fatima Bello", "Emeka Nwosu"),
    ("Hassan Ibrahim", "Grace Adeyemi"),
    ("John Smith", "Lagos Ventures Ltd"),
    ("Amina Yusuf", "Kano Trading Co"),
    ("Politically Exposed Person", "Shell Nigeria"),
]

MOCK_NARRATIONS = [
    "Salary payment",
    "Business transfer",
    "FX remittance",
    "Cash deposit — branch counter",
    "Interbank settlement",
    "Mobile wallet top-up",
]

CSV_CHANNELS = [
    TransactionChannel.NIP,
    TransactionChannel.RTGS,
    TransactionChannel.MOBILE,
    TransactionChannel.CASH_WITHDRAWAL,
]


class FinacleExtractor:
    """Extract reportable transactions from Finacle sources."""

    ALL_CHANNELS = list(TransactionChannel)

    def __init__(self) -> None:
        self.mode = settings.finacle_mode.lower()

    async def extract(
        self,
        channels: list[TransactionChannel] | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> list[RawTransaction]:
        if self.mode == "mock":
            return self._extract_mock(channels, date_from, date_to)
        if self.mode == "csv":
            source = CsvFinacleSource()
            selected = channels or CSV_CHANNELS
            return source.extract(selected, date_from, date_to)
        if self.mode == "oracle":
            source = OracleFinacleSource()
            selected = channels or CSV_CHANNELS
            return await asyncio.to_thread(source.extract, selected, date_from, date_to)
        raise ValueError(f"Unknown finacle_mode: {self.mode}. Use mock, csv, or oracle.")

    def _extract_mock(
        self,
        channels: list[TransactionChannel] | None,
        date_from: datetime | None,
        date_to: datetime | None,
    ) -> list[RawTransaction]:
        selected = channels or self.ALL_CHANNELS
        end = date_to or datetime.now(timezone.utc)
        start = date_from or (end - timedelta(days=1))
        records: list[RawTransaction] = []

        for channel in selected:
            count = randint(8, 20)
            for i in range(count):
                sender, receiver = choice(MOCK_NAMES)
                amount = self._amount_for_channel(channel)
                currency = "USD" if channel == TransactionChannel.SWIFT else "NGN"
                tx_date = start + timedelta(
                    seconds=randint(0, max(int((end - start).total_seconds()), 1))
                )
                records.append(
                    RawTransaction(
                        finacle_ref=f"FIN-{channel.value}-{tx_date.strftime('%Y%m%d')}-{i:04d}",
                        channel=channel,
                        transaction_date=tx_date,
                        amount=amount,
                        currency=currency,
                        sender_name=sender,
                        sender_account=f"{randint(1000000000, 9999999999)}",
                        receiver_name=receiver,
                        receiver_account=f"{randint(1000000000, 9999999999)}",
                        branch_code=f"{randint(1, 50):03d}",
                        narration=choice(MOCK_NARRATIONS),
                    )
                )
        return records

    def _amount_for_channel(self, channel: TransactionChannel) -> float:
        if channel == TransactionChannel.SWIFT:
            return round(uniform(12_000, 250_000), 2)
        if channel in (TransactionChannel.CASH_DEPOSIT, TransactionChannel.CASH_WITHDRAWAL):
            return round(uniform(3_000_000, 15_000_000), 2)
        if channel == TransactionChannel.RTGS:
            return round(uniform(5_000_000, 50_000_000), 2)
        return round(uniform(50_000, 8_000_000), 2)
