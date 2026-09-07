# Finacle → Nova Compliance Sidecar Mapping

## Bank-confirmed source (production)

| Purpose | Schema.Table | Notes |
|---------|--------------|-------|
| **All transactions** | `TBAADM.HTD` | History Transaction Detail — single source of truth |
| **Account / customer** | `TBAADM.GAM` | General Account Master — FORACID, ACCT_NAME, CIF link |

Nova middleware / Finacle posts every transaction to **HTD**. Customer names resolve via **GAM** join on `ACID`.

UAT `CUSTOM.*` channel tables (NIPTRANS, RTGSTRAN, etc.) were portal/export copies with sample data — useful for offline CSV dev, but **not** the production extract path.

## Extract modes

| `FINACLE_MODE` | Description |
|----------------|-------------|
| `mock` | Random demo data |
| `csv` | Read from `finacle_samples/*.csv` (UAT exports, offline dev) |
| `oracle` | Live query — default source **`htd`** (TBAADM.HTD + GAM join) |

## Oracle configuration

```env
FINACLE_MODE=oracle
FINACLE_ORACLE_SOURCE=htd          # htd (default) | channels (legacy CUSTOM tables)
FINACLE_ADMIN_SCHEMA=TBAADM
FINACLE_SCHEMA=CUSTOM              # only used when FINACLE_ORACLE_SOURCE=channels
FINACLE_CUSTOMER_TABLE=TBAADM.GAM
FINACLE_ORACLE_DSN=host:1521/service
FINACLE_ORACLE_USER=readonly_user
FINACLE_ORACLE_PASSWORD=***
```

## TBAADM.HTD → RawTransaction

Oracle query joins GAM for account number and name:

| Sidecar field | HTD / GAM column |
|---------------|------------------|
| finacle_ref | TRAN_ID |
| transaction_date | PSTD_DATE (fallback TRAN_DATE) |
| amount | TRAN_AMT |
| currency | REF_CRNCY_CODE |
| sender_account | FORACID (debit leg, PART_TRAN_TYPE = D) |
| sender_name | GAM.ACCT_NAME (fallback parse TRAN_PARTICULAR) |
| receiver_account | FORACID (credit leg, PART_TRAN_TYPE = C) |
| receiver_name | GAM.ACCT_NAME |
| branch_code | SOL_ID |
| narration | TRAN_PARTICULAR |
| channel | inferred from TRAN_TYPE / TRAN_SUB_TYPE / TRAN_PARTICULAR |

Debit/credit legs are paired by `TRAN_ID` (same pattern as withdrawal dedupe).

## TBAADM.GAM → customer names

| Sidecar | GAM column |
|---------|------------|
| account | FORACID |
| customer name | ACCT_NAME |

CSV offline stub: `finacle_samples/CUSTOMER_NAMES.csv` until GAM is queried live.

## Legacy CUSTOM channel tables (CSV / `oracle_source=channels`)

| Channel | Table | CSV file |
|---------|-------|----------|
| NIP | CUSTOM.NIPTRANS | NIPTRANS.csv |
| RTGS | CUSTOM.RTGSTRAN | RTGSTRAN.csv |
| MOBILE | CUSTOM.CASHLESS_TRAN_TABLE | CASHLESS_TRAN_TABLE.csv |
| CASH_WITHDRAWAL | CUSTOM.WITHDRAWAL_TRAN_TBL | WITHDRAWAL_TRAN_TBL.csv |

## PEP flagging

`CUSTOM.PEP_CUSTOMERS` (CSV: `PEP_CUSTOMERS.csv`) — FORACID + NAMES lookup.

## VPN validation checklist

When connected to UAT with test data:

```sql
-- Row counts
SELECT COUNT(*) FROM TBAADM.HTD;
SELECT COUNT(*) FROM TBAADM.GAM;

-- Sample join (confirm column names match)
SELECT h.TRAN_ID, h.PART_TRAN_TYPE, g.FORACID, g.ACCT_NAME, h.TRAN_AMT, h.TRAN_PARTICULAR
FROM TBAADM.HTD h
LEFT JOIN TBAADM.GAM g ON h.ACID = g.ACID
WHERE ROWNUM <= 20;
```

Export results to `finacle_samples/HTD.csv` and `finacle_samples/GAM.csv` for offline dev if needed.
