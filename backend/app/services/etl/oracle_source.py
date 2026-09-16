"""Oracle extract — TBAADM.HTD (primary) or legacy CUSTOM channel tables."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
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
from app.services.etl.oracle_client import connect_oracle, get_oracledb

logger = logging.getLogger(__name__)

HTD_PAGE_SIZE = 50
HTD_COUNT_TIMEOUT_MS = 25_000


@dataclass
class HtdDayCursor:
    last_id: str | None = None
    last_srl: int = 0
    leftover: list[dict] = field(default_factory=list)
    legs_fetched: int = 0
    pages_fetched: int = 0
    done: bool = False


def split_htd_flush(
    combined: list[dict],
    page: list[dict],
    page_size: int,
) -> tuple[list[dict], list[dict], bool]:
    """Hold the last TRAN_ID on a full page so D/C pairing is not split across flushes."""
    if not page:
        return combined, [], True
    if len(page) < page_size:
        return combined, [], True
    last_tid = str(page[-1].get("tran_id") or page[-1].get("TRAN_ID") or "")
    ready = [row for row in combined if str(row.get("tran_id") or row.get("TRAN_ID") or "") != last_tid]
    leftover = [row for row in combined if str(row.get("tran_id") or row.get("TRAN_ID") or "") == last_tid]
    return ready, leftover, False


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
            h.ACID,
            g.FORACID,
            g.ACCT_NAME
        FROM {admin_schema}.HTD h
        LEFT JOIN {admin_schema}.GAM g
          ON h.ACID = g.ACID
         AND NVL(g.DEL_FLG, 'N') = 'N'
        WHERE (
                (h.PSTD_DATE >= :date_from AND h.PSTD_DATE < :date_to_exclusive)
             OR (h.PSTD_DATE IS NULL AND h.TRAN_DATE >= :date_from AND h.TRAN_DATE < :date_to_exclusive)
              )
    """

    HTD_PAGE_QUERY = """
        SELECT
            TRAN_ID,
            TRAN_DATE,
            PSTD_DATE,
            TRAN_AMT,
            REF_CRNCY_CODE,
            PART_TRAN_TYPE,
            PART_TRAN_SRL_NUM,
            TRAN_PARTICULAR,
            TRAN_TYPE,
            TRAN_SUB_TYPE,
            SOL_ID,
            ACID
        FROM {admin_schema}.HTD
        WHERE (
                (PSTD_DATE >= :date_from AND PSTD_DATE < :date_to_exclusive)
             OR (PSTD_DATE IS NULL AND TRAN_DATE >= :date_from AND TRAN_DATE < :date_to_exclusive)
              )
          AND (
                :last_id IS NULL
             OR TRAN_ID > :last_id
             OR (TRAN_ID = :last_id AND NVL(PART_TRAN_SRL_NUM, 0) > :last_srl)
              )
        ORDER BY TRAN_ID, NVL(PART_TRAN_SRL_NUM, 0)
        FETCH FIRST {page_size} ROWS ONLY
    """

    HTD_COUNT_QUERY = """
        SELECT COUNT(*)
        FROM {admin_schema}.HTD
        WHERE (
                (PSTD_DATE >= :date_from AND PSTD_DATE < :date_to_exclusive)
             OR (PSTD_DATE IS NULL AND TRAN_DATE >= :date_from AND TRAN_DATE < :date_to_exclusive)
              )
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
        logger.info("Opening Oracle session to %s", settings.finacle_oracle_dsn)
        rows = self._fetch_htd_pages(
            oracledb, admin_schema, date_from, date_to_exclusive, HTD_PAGE_SIZE
        )
        rows = self._attach_gam_names(oracledb, admin_schema, rows)
        return map_htd_rows(rows, customers)

    def count_htd_legs(self, date_from, date_to_exclusive, oracledb) -> int | None:
        """Best-effort COUNT(*) for a progress denominator. Never required for staging."""
        sql = self.HTD_COUNT_QUERY.format(admin_schema=settings.finacle_admin_schema)
        try:
            with connect_oracle(oracledb) as conn:
                if hasattr(conn, "call_timeout"):
                    conn.call_timeout = HTD_COUNT_TIMEOUT_MS
                with conn.cursor() as cursor:
                    cursor.execute(sql, date_from=date_from, date_to_exclusive=date_to_exclusive)
                    row = cursor.fetchone()
                    if not row:
                        return None
                    return int(row[0])
        except Exception as exc:
            logger.warning("HTD COUNT skipped: %s", exc)
            return None

    def fetch_htd_flush_page(
        self,
        oracledb,
        admin_schema: str,
        date_from,
        date_to_exclusive,
        cursor: HtdDayCursor,
    ) -> tuple[list[dict], HtdDayCursor]:
        """Fetch one HTD page, attach GAM names, and return rows ready to map/stage."""
        if cursor.done:
            return [], cursor

        sql = self.HTD_PAGE_QUERY.format(admin_schema=admin_schema, page_size=HTD_PAGE_SIZE)
        page = self._fetch_one_htd_page(
            oracledb, sql, date_from, date_to_exclusive, cursor.last_id, cursor.last_srl
        )
        if not page:
            ready, leftover, done = split_htd_flush(cursor.leftover, [], HTD_PAGE_SIZE)
            cursor.leftover = leftover
            cursor.done = done
            return self._attach_gam_names(oracledb, admin_schema, ready), cursor

        cursor.pages_fetched += 1
        cursor.legs_fetched += len(page)
        last = page[-1]
        cursor.last_id = str(last.get("tran_id") or "")
        try:
            cursor.last_srl = int(last.get("part_tran_srl_num") or 0)
        except (TypeError, ValueError):
            cursor.last_srl = 0

        combined = cursor.leftover + page
        ready, leftover, done = split_htd_flush(combined, page, HTD_PAGE_SIZE)
        cursor.leftover = leftover
        cursor.done = done
        logger.info(
            "Paged HTD fetch: %s legs (last TRAN_ID=%s, flush=%s, leftover=%s)",
            cursor.legs_fetched,
            cursor.last_id,
            len(ready),
            len(leftover),
        )
        return self._attach_gam_names(oracledb, admin_schema, ready), cursor

    def _fetch_htd_pages(
        self,
        oracledb,
        admin_schema: str,
        date_from,
        date_to_exclusive,
        page_size: int,
    ) -> list[dict]:
        """Reconnect every page so VPN/Oracle cannot kill a long-lived cursor (ORA-03113)."""
        sql = self.HTD_PAGE_QUERY.format(admin_schema=admin_schema, page_size=page_size)
        rows: list[dict] = []
        last_id: str | None = None
        last_srl = 0
        while True:
            page = self._fetch_one_htd_page(
                oracledb, sql, date_from, date_to_exclusive, last_id, last_srl
            )
            if not page:
                break
            rows.extend(page)
            last = page[-1]
            last_id = str(last.get("tran_id") or "")
            try:
                last_srl = int(last.get("part_tran_srl_num") or 0)
            except (TypeError, ValueError):
                last_srl = 0
            logger.info("Paged HTD fetch: %s legs (last TRAN_ID=%s)", len(rows), last_id)
            if len(page) < page_size:
                break
        return rows

    def _fetch_one_htd_page(
        self,
        oracledb,
        sql: str,
        date_from,
        date_to_exclusive,
        last_id: str | None,
        last_srl: int,
    ) -> list[dict]:
        last_error: Exception | None = None
        for attempt in range(3):
            try:
                with connect_oracle(oracledb) as conn:
                    with conn.cursor() as cursor:
                        cursor.execute(
                            sql,
                            date_from=date_from,
                            date_to_exclusive=date_to_exclusive,
                            last_id=last_id,
                            last_srl=last_srl,
                        )
                        cols = [d[0].lower() for d in cursor.description]
                        return [dict(zip(cols, row)) for row in cursor.fetchall()]
            except Exception as exc:
                last_error = exc
                logger.warning("HTD page retry %s/3 after %s", attempt + 1, exc)
        if last_error:
            raise last_error
        return []

    def _attach_gam_names(self, oracledb, admin_schema: str, rows: list[dict]) -> list[dict]:
        if not rows:
            return rows
        acids = sorted({str(r.get("acid") or "") for r in rows if r.get("acid")})
        if not acids:
            for row in rows:
                row.setdefault("foracid", "")
                row.setdefault("acct_name", "")
            return rows
        names: dict[str, tuple[str, str]] = {}
        with connect_oracle(oracledb) as conn:
            with conn.cursor() as cursor:
                for i in range(0, len(acids), 50):
                    chunk = acids[i : i + 50]
                    binds = ",".join(f":a{j}" for j in range(len(chunk)))
                    cursor.execute(
                        f"""
                        SELECT ACID, FORACID, ACCT_NAME
                        FROM {admin_schema}.GAM
                        WHERE ACID IN ({binds})
                          AND NVL(DEL_FLG, 'N') = 'N'
                        """,
                        {f"a{j}": v for j, v in enumerate(chunk)},
                    )
                    for acid, foracid, acct_name in cursor.fetchall():
                        names[str(acid)] = (str(foracid or ""), str(acct_name or ""))
        for row in rows:
            foracid, acct_name = names.get(str(row.get("acid") or ""), ("", ""))
            row["foracid"] = foracid
            row["acct_name"] = acct_name
        return rows

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

        with connect_oracle(oracledb) as conn:
            with conn.cursor() as cursor:
                for channel in selected:
                    sql = self.CHANNEL_QUERIES[channel].format(schema=schema)
                    cursor.execute(sql, date_from=date_from, date_to=date_to)
                    cols = [d[0].lower() for d in cursor.description]
                    rows = [dict(zip(cols, row)) for row in cursor.fetchall()]
                    records.extend(mappers[channel](rows))

        return records
