from app.services.etl.htd_mapper import map_htd_rows
from app.services.etl.nip_flow import (
    NipFlowLookup,
    NOVA_NIBSS_INSTITUTION_CODE,
    register_inbound_row,
    register_outbound_row,
)


def test_nip_outbound_enriches_dest_institution():
    outbound: dict = {}
    register_outbound_row(outbound, "M00000184", 311415, None, "000009")
    lookup = NipFlowLookup(outbound=outbound, names={"000009": "Test Bank Nine"})

    mapped = map_htd_rows(
        [
            {
                "tran_id": "M00000184",
                "part_tran_type": "D",
                "foracid": "1001010207",
                "acct_name": "SENDER",
                "tran_amt": 311415,
                "bank_code": "",
                "tran_particular": "NIP TRANSFER OUT",
                "tran_type": "T",
                "tran_sub_type": "CI",
                "pstd_date": "2025-11-29",
                "sol_id": "001",
            },
            {
                "tran_id": "M00000184",
                "part_tran_type": "C",
                "foracid": "1001010208",
                "acct_name": "RECEIVER",
                "tran_amt": 311415,
                "bank_code": "",
                "tran_particular": "NIP TRANSFER OUT",
                "tran_type": "T",
                "tran_sub_type": "CI",
                "pstd_date": "2025-11-29",
                "sol_id": "001",
            },
        ],
        nip_lookup=lookup,
    )
    tx = mapped[0]
    assert tx.source_institution_code == NOVA_NIBSS_INSTITUTION_CODE
    assert tx.dest_institution_code == "000009"
    assert tx.dest_institution_name == "Test Bank Nine"


def test_nip_inbound_enriches_source_institution():
    inbound: dict = {}
    register_inbound_row(inbound, "M00000105", 1000, "000001", "060003")
    lookup = NipFlowLookup(inbound=inbound, names={"000001": "First Bank"})

    mapped = map_htd_rows(
        [
            {
                "tran_id": "M00000105",
                "part_tran_type": "D",
                "foracid": "1001010207",
                "acct_name": "SENDER",
                "tran_amt": 1000,
                "bank_code": "",
                "tran_particular": "NIP IN",
                "tran_type": "T",
                "tran_sub_type": "CI",
                "pstd_date": "2025-11-29",
                "sol_id": "001",
            },
            {
                "tran_id": "M00000105",
                "part_tran_type": "C",
                "foracid": "1001010208",
                "acct_name": "RECEIVER",
                "tran_amt": 1000,
                "bank_code": "",
                "tran_particular": "NIP IN",
                "tran_type": "T",
                "tran_sub_type": "CI",
                "pstd_date": "2025-11-29",
                "sol_id": "001",
            },
        ],
        nip_lookup=lookup,
    )
    tx = mapped[0]
    assert tx.source_institution_code == "000001"
    assert tx.source_institution_name == "First Bank"
    assert tx.dest_institution_code == "060003"


def test_nip_outbound_falls_back_to_closest_amount_on_same_tran_id():
    outbound: dict = {}
    register_outbound_row(outbound, "M00000022", 4900000, None, "000014")
    register_outbound_row(outbound, "M00000022", 5000000, None, "000016")
    lookup = NipFlowLookup(outbound=outbound, names={"000016": "Bank Sixteen"})

    mapped = map_htd_rows(
        [
            {
                "tran_id": "M00000022",
                "part_tran_type": "D",
                "foracid": "1001013150",
                "acct_name": "SENDER",
                "tran_amt": 5000000,
                "bank_code": "",
                "tran_particular": "TRF IFO MAPLE LEAF PRESS LTD",
                "tran_type": "T",
                "tran_sub_type": "CI",
                "pstd_date": "2023-02-02",
                "sol_id": "001",
            },
            {
                "tran_id": "M00000022",
                "part_tran_type": "C",
                "foracid": "1001013167",
                "acct_name": "RECEIVER",
                "tran_amt": 5000000,
                "bank_code": "",
                "tran_particular": "TRF IFO MAPLE LEAF PRESS LTD",
                "tran_type": "T",
                "tran_sub_type": "CI",
                "pstd_date": "2023-02-02",
                "sol_id": "001",
            },
        ],
        nip_lookup=lookup,
    )
    tx = mapped[0]
    assert tx.dest_institution_code == "000016"


def test_nip_not_applied_to_rtgs():
    outbound: dict = {}
    register_outbound_row(outbound, "M00000003", 144000000, None, "000015")
    lookup = NipFlowLookup(outbound=outbound)

    mapped = map_htd_rows(
        [
            {
                "tran_id": "M00000003",
                "part_tran_type": "D",
                "foracid": "0110002001",
                "acct_name": "SENDER",
                "tran_amt": 144000000,
                "bank_code": "",
                "tran_particular": "RTGS INFLOW IFO ZPC",
                "tran_type": "T",
                "tran_sub_type": "CI",
                "pstd_date": "2023-02-02",
                "sol_id": "001",
            },
            {
                "tran_id": "M00000003",
                "part_tran_type": "C",
                "foracid": "1101010310",
                "acct_name": "RECEIVER",
                "tran_amt": 144000000,
                "bank_code": "",
                "tran_particular": "RTGS INFLOW IFO ZPC",
                "tran_type": "T",
                "tran_sub_type": "CI",
                "pstd_date": "2023-02-02",
                "sol_id": "001",
            },
        ],
        nip_lookup=lookup,
    )
    assert mapped[0].dest_institution_code is None


def test_finacle_bank_code_on_leg_not_overwritten():
    outbound: dict = {}
    register_outbound_row(outbound, "M00000184", 3500, None, "000009")
    lookup = NipFlowLookup(outbound=outbound)

    mapped = map_htd_rows(
        [
            {
                "tran_id": "M00000184",
                "part_tran_type": "D",
                "foracid": "0240303082",
                "acct_name": "SMS EXPENSE",
                "tran_amt": 3500,
                "bank_code": "",
                "tran_particular": "CUSTOMER CREDIT",
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
                "bank_code": "057",
                "tran_particular": "CUSTOMER CREDIT",
                "tran_type": "T",
                "tran_sub_type": "CI",
                "pstd_date": "2025-11-29",
                "sol_id": "001",
            },
        ],
        banks={"057": "ZENITH INTERNATIONAL BANK PLC"},
        nip_lookup=lookup,
    )
    tx = mapped[0]
    assert tx.dest_institution_code == "057"
    assert tx.dest_institution_name == "ZENITH INTERNATIONAL BANK PLC"
