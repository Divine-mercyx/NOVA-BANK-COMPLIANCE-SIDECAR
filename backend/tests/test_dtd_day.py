from datetime import date, datetime, timedelta
from types import SimpleNamespace

from app.services.etl.dtd_control import resolve_posted_since
from app.services.etl.dtd_pipeline import lagos_day_bounds
from app.services.etl.oracle_source import OracleFinacleSource, named_binds_for_sql


def test_lagos_day_bounds_are_one_calendar_day():
    start_aware, start_naive, end_exclusive = lagos_day_bounds(date(2026, 9, 18))
    assert start_naive.day == 18
    assert start_naive.hour == 0
    assert end_exclusive.day == 19
    assert start_aware.tzinfo is not None


def test_resume_uses_watermark_with_overlap():
    day = date(2026, 9, 18)
    wm = datetime(2026, 9, 18, 14, 0)
    state = SimpleNamespace(watermark_at=wm, watermark_day="2026-09-18")
    since = resolve_posted_since(state, day, rescan=False)
    assert since == wm - timedelta(minutes=5)


def test_new_day_rescans_from_midnight():
    day = date(2026, 9, 18)
    _, start_naive, _ = lagos_day_bounds(day)
    state = SimpleNamespace(watermark_at=datetime(2026, 9, 17, 23, 0), watermark_day="2026-09-17")
    assert resolve_posted_since(state, day, rescan=False) == start_naive
    state.watermark_day = "2026-09-18"
    assert resolve_posted_since(state, day, rescan=True) == start_naive


def test_dtd_page_binds_omit_date_from():
    sql = OracleFinacleSource.DTD_PAGE_QUERY.format(admin_schema="TBAADM", page_size=50)
    binds = named_binds_for_sql(
        sql,
        {
            "date_from": datetime(2026, 9, 18),
            "date_to_exclusive": datetime(2026, 9, 19),
            "last_id": None,
            "last_srl": 0,
            "posted_since": datetime(2026, 9, 18, 12, 0),
        },
    )
    assert "date_from" not in binds
    assert set(binds) == {"posted_since", "date_to_exclusive", "last_id", "last_srl"}
    assert "BANK_CODE" in sql


def test_empty_dtd_bank_code_is_nova():
    from app.services.etl.institution import resolve_institution
    from app.services.etl.htd_mapper import map_htd_rows

    assert resolve_institution({"BANK_CODE": "", "BANK_ID": "01"}) == ("60003", "NOVA BANK")
    assert resolve_institution({"bank_code": "058"}) == ("058", "GTBANK")

    mapped = map_htd_rows(
        [
            {
                "tran_id": "M00000184",
                "part_tran_type": "D",
                "foracid": "0240303082",
                "acct_name": "SMS EXPENSE",
                "tran_amt": 3500,
                "bank_code": "",
                "tran_particular": "CUSTOMER CREDIT: ACCRUED SMS EXPENSE",
                "tran_type": "T",
                "tran_sub_type": "CI",
                "pstd_date": "2025-11-29",
                "sol_id": "001",
            },
            {
                "tran_id": "M00000184",
                "part_tran_type": "C",
                "foracid": "1001010207",
                "acct_name": "CUSTOMER",
                "tran_amt": 3500,
                "bank_code": "",
                "tran_particular": "CUSTOMER CREDIT: ACCRUED SMS EXPENSE",
                "tran_type": "T",
                "tran_sub_type": "CI",
                "pstd_date": "2025-11-29",
                "sol_id": "001",
            },
        ]
    )
    tx = mapped[0]
    assert tx.source_institution_code == "60003"
    assert tx.dest_institution_name == "NOVA BANK"
