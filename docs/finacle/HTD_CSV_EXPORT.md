# HTD CSV export from DBeaver (VPN offline test)

Use this when Oracle extract over VPN is too slow. Export a **small sample** in DBeaver, drop it in `backend/finacle_samples/HTD.csv`, and run the app in CSV mode.

## 1. DBeaver export query

Export **leg rows** (debit + credit), not just transaction count. Aim for **100–200 rows** (~50–100 transactions).

```sql
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
FROM TBAADM.HTD h
LEFT JOIN TBAADM.GAM g
  ON h.ACID = g.ACID
 AND NVL(g.DEL_FLG, 'N') = 'N'
WHERE NVL(h.PSTD_DATE, h.TRAN_DATE) >= DATE '2023-02-01'
  AND NVL(h.PSTD_DATE, h.TRAN_DATE) <  DATE '2023-02-04'
ORDER BY h.TRAN_ID, h.PART_TRAN_SRL_NUM
FETCH FIRST 200 ROWS ONLY;
```

In DBeaver: run query → right-click results → **Export data** → CSV → save as `HTD.csv`.

Copy to:

```
backend/finacle_samples/HTD.csv
```

Column headers must match (DBeaver usually exports uppercase — the mapper accepts lower/upper case).

## 2. App config

```env
FINACLE_MODE=csv
FINACLE_ORACLE_SOURCE=htd
FINACLE_SAMPLES_DIR=finacle_samples
```

Restart backend. Use the date picker with the same range as your export (2023-02-01 → 2023-02-03).

## 3. Even faster — mock mode

To test only UI / reports / workflow (no real Finacle data):

```env
FINACLE_MODE=mock
```

Click **Run extraction** — instant fake data.

## When to use which

| Mode | Use when |
|------|----------|
| `mock` | Demo UI, reports, roles — no VPN needed |
| `csv` + `HTD.csv` | Real Finacle shape, offline, fast |
| `oracle` | Production / UAT with patience or small date ranges |
