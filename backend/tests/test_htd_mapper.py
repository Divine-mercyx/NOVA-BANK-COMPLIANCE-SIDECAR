"""Tests for TBAADM.HTD mapping."""

from app.schemas.compliance import TransactionChannel
from app.services.etl.htd_mapper import infer_htd_channel, map_htd_rows


def test_infer_htd_channel_nip():
    assert infer_htd_channel("NIP TRANSFER TO JOHN", "T", "CI") == TransactionChannel.NIP


def test_infer_htd_channel_withdrawal():
    assert infer_htd_channel("CSHWD: Cheque Withdrawal BY JOY", "C", "NP") == TransactionChannel.CASH_WITHDRAWAL


def test_map_htd_rows_pairs_debit_credit():
    rows = [
        {
            "tran_id": "M00000999",
            "part_tran_type": "D",
            "foracid": "1002000063",
            "acct_name": "ENGR USMANY",
            "tran_amt": 1500,
            "ref_crncy_code": "NGN",
            "tran_particular": "NIP TRANSFER",
            "tran_type": "T",
            "tran_sub_type": "CI",
            "pstd_date": "2025-12-13",
            "sol_id": "001",
        },
        {
            "tran_id": "M00000999",
            "part_tran_type": "C",
            "foracid": "1102010043",
            "acct_name": "CWG USMANY",
            "tran_amt": 1500,
            "ref_crncy_code": "NGN",
            "tran_particular": "NIP TRANSFER",
            "tran_type": "T",
            "tran_sub_type": "CI",
            "pstd_date": "2025-12-13",
            "sol_id": "001",
        },
    ]
    mapped = map_htd_rows(rows)
    assert len(mapped) == 1
    tx = mapped[0]
    assert tx.finacle_ref.startswith("M00000999")
    assert tx.sender_name == "ENGR USMANY"
    assert tx.receiver_name == "CWG USMANY"
    assert tx.sender_account == "1002000063"
    assert tx.receiver_account == "1102010043"
    assert tx.channel == TransactionChannel.NIP


def test_map_htd_rows_multiple_legs_same_tran_id():
    """M00000010-style: one TRAN_ID, many D/C pairs at different amounts."""
    rows = [
        {"tran_id": "M00000010", "part_tran_type": "D", "foracid": "5025070845", "acct_name": "BUA GLOBAL REFINANCING ACCOUNT", "tran_amt": 4002404.31, "tran_particular": "BALANCE TRANSFER", "tran_type": "T", "tran_sub_type": "CI", "pstd_date": "2025-12-13", "sol_id": "001"},
        {"tran_id": "M00000010", "part_tran_type": "C", "foracid": "USD00126042001", "acct_name": "DUMMY MIG ACCOUNT", "tran_amt": 4002404.31, "tran_particular": "BALANCE TRANSFER", "tran_type": "T", "tran_sub_type": "CI", "pstd_date": "2025-12-13", "sol_id": "001"},
        {"tran_id": "M00000010", "part_tran_type": "D", "foracid": "5025051226", "acct_name": "BUA GLOBAL REFINANCING ACCOUNT", "tran_amt": 1884642.53, "tran_particular": "BALANCE TRANSFER", "tran_type": "T", "tran_sub_type": "CI", "pstd_date": "2025-12-13", "sol_id": "001"},
        {"tran_id": "M00000010", "part_tran_type": "C", "foracid": "USD00126042001", "acct_name": "DUMMY MIG ACCOUNT", "tran_amt": 1884642.53, "tran_particular": "BALANCE TRANSFER", "tran_type": "T", "tran_sub_type": "CI", "pstd_date": "2025-12-13", "sol_id": "001"},
    ]
    mapped = map_htd_rows(rows)
    assert len(mapped) == 2
    assert mapped[0].currency == "USD"
    assert mapped[0].sender_name == "BUA GLOBAL REFINANCING ACCOUNT"
    assert mapped[0].receiver_name == "DUMMY MIG ACCOUNT"
