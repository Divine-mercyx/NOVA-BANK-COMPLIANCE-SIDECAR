from app.services.etl.oracle_source import split_htd_flush
from app.services.etl.pipeline import ETLPipeline


def _row(tran_id: str) -> dict:
    return {"tran_id": tran_id, "part_tran_srl_num": 1}


def test_split_holds_last_tran_id_on_full_page():
    page = [_row("A")] * 2 + [_row("B")] * 3
    ready, leftover, done = split_htd_flush(page, page, page_size=5)
    assert done is False
    assert {r["tran_id"] for r in ready} == {"A"}
    assert {r["tran_id"] for r in leftover} == {"B"}
    assert len(leftover) == 3


def test_split_flushes_remainder_on_short_page():
    leftover = [_row("B"), _row("B")]
    page = [_row("B"), _row("C")]
    combined = leftover + page
    ready, held, done = split_htd_flush(combined, page, page_size=5)
    assert done is True
    assert held == []
    assert len(ready) == 4


def test_split_empty_page_flushes_leftover():
    leftover = [_row("Z")]
    ready, held, done = split_htd_flush(leftover, [], page_size=50)
    assert done is True
    assert held == []
    assert ready == leftover


def test_progress_message_includes_counts():
    message = ETLPipeline._htd_progress_message(
        day="2026-02-01",
        day_index=1,
        days=3,
        page=2,
        legs_fetched=56,
        legs_total=1286,
        staged=20,
        skipped=3,
        invalid=1,
        valid=19,
    )
    assert message.startswith("PROGRESS {")
    assert "entered 20" in message
    assert "already in staging 3" in message
    assert "invalid 1" in message
    assert "56/1286 HTD legs → 20 transactions" in message


def test_progress_message_without_count_total():
    message = ETLPipeline._htd_progress_message(
        day="2023-02-03",
        day_index=1,
        days=1,
        page=7,
        legs_fetched=350,
        legs_total=None,
        staged=0,
        skipped=177,
        invalid=0,
        valid=0,
    )
    assert "350 HTD legs → 0 transactions" in message
    assert "already in staging 177" in message
