"""Oracle extract — TBAADM.HTD (primary) or legacy CUSTOM channel tables."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, time
from zoneinfo import ZoneInfo

from app.core.config import settings
from app.schemas.compliance import RawTransaction, TransactionChannel
from app.services.etl.customer_registry import CustomerRegistry
from app.services.etl.finacle_mappers import (
    map_cashless,
    map_niptrans,
    map_rtgstran,
    map_withdrawal_rows,
)
from app.services.etl.htd_mapper import map_htd_rows
from app.services.etl.oracle_client import get_oracledb

logger = logging.getLogger(__name__)


class OracleFinacleSource:
    HTD_QUERY = """
        SELECT
            h.TRAN_ID,
            h.TRAN_DATE,
            h.PSTD_DATE,
            h.TRAN_AMT,
            h.REF_CRNCY_CODE,
            h.PART_TRAN_TYPE,
            h.PART_TRAN_SRL_NUM,
            h.TRAN_PARTICULAR,
            h.TRAN_TYPE,
            h.TRAN_SUB_TYPE,
            h.SOL_ID,
            g.FORACID,
            g.ACCT_NAME
        FROM {admin_schema}.HTD h
        LEFT JOIN {admin_schema}.GAM g
          ON h.ACID = g.ACID
         AND NVL(g.DEL_FLG, 'N') = 'N'
        WHERE NVL(h.PSTD_DATE, h.TRAN_DATE) >= :date_from
          AND NVL(h.PSTD_DATE, h.TRAN_DATE) < :date_to_exclusive
        ORDER BY h.TRAN_ID, h.PART_TRAN_SRL_NUM
    """

    CHANNEL_QUERIES: dict[TransactionChannel, str] = {
        TransactionChannel.NIP: """
            SELECT REF_NUM, CREDIT_ACCNT, TRAN_AMT, DEBIT_ACCNT, TRAN_DATE, TRANSID,
                   TRANPARTICULARS, PROCESS_FLG, SOL_ID, LCHG_USER_ID, LCHG_TIME,
                   RCRE_USER_ID, RCRE_TIME, BANK_ID
            FROM {schema}.NIPTRANS
            WHERE (:date_from IS NULL OR TRAN_DATE >= :date_from)
              AND (:date_to IS NULL OR TRAN_DATE <= :date_to)
        """,
        TransactionChannel.RTGS: """
            SELECT REF_NUM, CREDIT_ACCNT, TRAN_AMT, DEBIT_ACCNT, TRANSDATE, TRANSID,
                   CRNCY, NARRATIONS, PROCESS_FLG, SOLID, STATUS_MSG, LCHG_USERID,
                   LCHG_TIME, BANK_ID
            FROM {schema}.RTGSTRAN
            WHERE (:date_from IS NULL OR TRANSDATE >= :date_from)
              AND (:date_to IS NULL OR TRANSDATE <= :date_to)
        """,
        TransactionChannel.MOBILE: """
            SELECT ACID, ACCT_SOL, INIT_SOL, TRAN_DATE, TRAN_TYPE, TRAN_SUB_TYPE,
                   TRAN_ID, CIF_ID, CUSTOMER_ID, TRAN_AMT, TOTAL_AMT, RCRE_TIME
            FROM {schema}.CASHLESS_TRAN_TABLE
            WHERE (:date_from IS NULL OR TRAN_DATE >= :date_from)
              AND (:date_to IS NULL OR TRAN_DATE <= :date_to)
        """,
        TransactionChannel.CASH_WITHDRAWAL: """
            SELECT TRAN_DATE, TRAN_ID, TRAN_TYPE, TRAN_SUB_TYPE, CHANNEL, PART_TRAN_TYPE,
                   ACCT_NUMB, REF_CRNCY_CODE, TRAN_AMT, PARTICULAR, ENTRY_DATE, PSTD_DATE,
                   INIT_SOL, CIF_ID, BANK_ID
            FROM {schema}.WITHDRAWAL_TRAN_TBL
            WHERE (:date_from IS NULL OR PSTD_DATE >= :date_from)
              AND (:date_to IS NULL OR PSTD_DATE <= :date_to)
        """,
    }

    def extract(
        self,
        channels: list[TransactionChannel] | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> list[RawTransaction]:
        oracledb = get_oracledb()

        if not settings.finacle_oracle_dsn:
            raise RuntimeError("FINACLE_ORACLE_DSN is not configured")

        source = settings.finacle_oracle_source.lower()
        date_from, date_to_exclusive = self._resolve_dates(date_from, date_to)
        if source == "htd":
            return self._extract_htd(date_from, date_to_exclusive, oracledb)
        return self._extract_channels(channels, date_from, date_to_exclusive, oracledb)

    @staticmethod
    def _bank_tz() -> ZoneInfo:
        return ZoneInfo(settings.finacle_timezone)

    @classmethod
    def _resolve_dates(
        cls,
        date_from: datetime | None,
        date_to: datetime | None,
    ) -> tuple[datetime, datetime]:
        """Return naive datetimes for Oracle DATE binds (bank local calendar days)."""
        tz = cls._bank_tz()
        end = date_to or datetime.now(tz)
        if end.tzinfo is None:
            end = end.replace(tzinfo=tz)
        else:
            end = end.astimezone(tz)

        if date_from is None:
            days = max(settings.finacle_oracle_default_days, 1)
            start = end - timedelta(days=days)
        else:
            start = date_from
            if start.tzinfo is None:
                start = start.replace(tzinfo=tz)
            else:
                start = start.astimezone(tz)

        start_naive = datetime.combine(start.date(), time.min)
        end_exclusive = datetime.combine(end.date() + timedelta(days=1), time.min)
        logger.info(
            "Oracle HTD window (%s): %s → %s (exclusive end %s)",
            settings.finacle_timezone,
            start_naive.isoformat(sep=" "),
            datetime.combine(end.date(), time.max).isoformat(sep=" "),
            end_exclusive.isoformat(sep=" "),
        )
        return start_naive, end_exclusive

    def iter_day_windows(
        self,
        start_naive: datetime,
        end_exclusive: datetime,
    ):
        """Yield one calendar day at a time for chunked HTD extract."""
        current = start_naive
        while current < end_exclusive:
            next_day = datetime.combine(current.date() + timedelta(days=1), time.min)
            yield current, min(next_day, end_exclusive)
            current = next_day

    def extract_htd_window(
        self,
        date_from: datetime,
        date_to_exclusive: datetime,
        oracledb,
    ) -> list[RawTransaction]:
        """Fetch one HTD window in batches (one day recommended for D/C pairing)."""
        customers = CustomerRegistry.default()
        admin_schema = settings.finacle_admin_schema
        sql = self.HTD_QUERY.format(admin_schema=admin_schema)
        batch_size = max(settings.finacle_oracle_fetch_batch_size, 500)
        rows: list[dict] = []

        with oracledb.connect(
            user=settings.finacle_oracle_user,
            password=settings.finacle_oracle_password,
            dsn=settings.finacle_oracle_dsn,
        ) as conn:
            with conn.cursor() as cursor:
                cursor.arraysize = batch_size
                cursor.execute(
                    sql,
                    date_from=date_from,
                    date_to_exclusive=date_to_exclusive,
                )
                cols = [d[0].lower() for d in cursor.description]
                while True:
                    chunk = cursor.fetchmany(batch_size)
                    if not chunk:
                        break
                    rows.extend(dict(zip(cols, row)) for row in chunk)

        return map_htd_rows(rows, customers)

    def _extract_htd(
        self,
        date_from: datetime,
        date_to_exclusive: datetime,
        oracledb,
    ) -> list[RawTransaction]:
        logger.info(
            "Querying %s.HTD with NVL(PSTD_DATE, TRAN_DATE) from %s to %s",
            settings.finacle_admin_schema,
            date_from,
            date_to_exclusive,
        )
        mapped = self.extract_htd_window(date_from, date_to_exclusive, oracledb)
        logger.info("Mapped HTD window to %s transactions", len(mapped))
        return mapped

    def _extract_channels(
        self,
        channels: list[TransactionChannel] | None,
        date_from: datetime | None,
        date_to: datetime | None,
        oracledb,
    ) -> list[RawTransaction]:
        customers = CustomerRegistry.default()
        mappers = {
            TransactionChannel.NIP: lambda rows: [map_niptrans(r, customers) for r in rows],
            TransactionChannel.RTGS: lambda rows: [map_rtgstran(r, customers) for r in rows],
            TransactionChannel.MOBILE: lambda rows: [map_cashless(r) for r in rows],
            TransactionChannel.CASH_WITHDRAWAL: lambda rows: map_withdrawal_rows(rows),
        }

        selected = channels or list(self.CHANNEL_QUERIES.keys())
        schema = settings.finacle_schema
        records: list[RawTransaction] = []

        with oracledb.connect(
            user=settings.finacle_oracle_user,
            password=settings.finacle_oracle_password,
            dsn=settings.finacle_oracle_dsn,
        ) as conn:
            with conn.cursor() as cursor:
                for channel in selected:
                    sql = self.CHANNEL_QUERIES[channel].format(schema=schema)
                    cursor.execute(sql, date_from=date_from, date_to=date_to)
                    cols = [d[0].lower() for d in cursor.description]
                    rows = [dict(zip(cols, row)) for row in cursor.fetchall()]
                    records.extend(mappers[channel](rows))

        return records
