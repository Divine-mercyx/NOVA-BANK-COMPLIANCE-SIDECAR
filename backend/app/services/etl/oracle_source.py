"""Oracle extract — TBAADM.HTD (primary) or legacy CUSTOM channel tables."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

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
        WHERE (:date_from IS NULL OR h.PSTD_DATE >= :date_from)
          AND (:date_to IS NULL OR h.PSTD_DATE <= :date_to)
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
        date_from, date_to = self._resolve_dates(date_from, date_to)
        if source == "htd":
            return self._extract_htd(date_from, date_to, oracledb)
        return self._extract_channels(channels, date_from, date_to, oracledb)

    @staticmethod
    def _resolve_dates(
        date_from: datetime | None,
        date_to: datetime | None,
    ) -> tuple[datetime, datetime]:
        end = date_to or datetime.now(timezone.utc)
        if date_from is None:
            days = max(settings.finacle_oracle_default_days, 1)
            start = end - timedelta(days=days)
            logger.info(
                "No date range supplied — defaulting Oracle extract to last %s day(s): %s → %s",
                days,
                start.isoformat(),
                end.isoformat(),
            )
            return start, end
        return date_from, end

    def _extract_htd(
        self,
        date_from: datetime | None,
        date_to: datetime | None,
        oracledb,
    ) -> list[RawTransaction]:
        customers = CustomerRegistry.default()
        admin_schema = settings.finacle_admin_schema
        sql = self.HTD_QUERY.format(admin_schema=admin_schema)
        logger.info(
            "Querying %s.HTD from %s to %s (this can take a few minutes on VPN)",
            admin_schema,
            date_from.isoformat(),
            date_to.isoformat(),
        )

        with oracledb.connect(
            user=settings.finacle_oracle_user,
            password=settings.finacle_oracle_password,
            dsn=settings.finacle_oracle_dsn,
        ) as conn:
            with conn.cursor() as cursor:
                cursor.arraysize = 5000
                cursor.execute(sql, date_from=date_from, date_to=date_to)
                cols = [d[0].lower() for d in cursor.description]
                rows = [dict(zip(cols, row)) for row in cursor.fetchall()]
        logger.info("Fetched %s HTD leg rows from Oracle", len(rows))
        return map_htd_rows(rows, customers)

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
