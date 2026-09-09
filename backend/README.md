# Nova Middleware — Compliance API

FastAPI backend for NFIU regulatory reporting (M1) and real-time transaction screening (M2).

## Quick start

```bash
docker compose up -d
python3.11 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Seeded admin

- Email: `admin@novabank.ng`
- Password: `Admin@Nova2026`
- OTP prints in the backend terminal

## Finacle extract (Module 1)

Default mode is **`csv`** — loads your UAT exports from `finacle_samples/`.

```env
FINACLE_MODE=csv          # mock | csv | oracle
FINACLE_SAMPLES_DIR=finacle_samples
```

For live Oracle (on VPN) — **all transactions in TBAADM.HTD**, names from **TBAADM.GAM**:

```env
FINACLE_MODE=oracle
FINACLE_ORACLE_SOURCE=htd
FINACLE_ADMIN_SCHEMA=TBAADM
FINACLE_ORACLE_DSN=host:1521/service
FINACLE_ORACLE_USER=readonly_user
FINACLE_ORACLE_PASSWORD=secret
FINACLE_ORACLE_THICK_MODE=true
FINACLE_ORACLE_CLIENT_LIB_DIR=C:\oracle\instantclient_21_13
```

If you see **`DPY-3015: password verifier type 0x939`** — the network is fine; Finacle uses a 10G password format that python-oracledb **thin mode** cannot use. Enable **thick mode**:

1. Download [Oracle Instant Client Basic](https://www.oracle.com/database/technologies/instant-client/downloads.html) (19c or 21c, Windows x64).
2. Unzip to e.g. `C:\oracle\instantclient_21_13` and add that folder to `PATH`.
3. In `backend/.env`: `FINACLE_ORACLE_THICK_MODE=true` (and `FINACLE_ORACLE_CLIENT_LIB_DIR` if not on PATH).
4. Test:

```powershell
cd backend
python scripts/test_oracle_connection.py
```

### Fetch a specific HTD date range (debug ETL on VPN)

Uses the **same query and mapper** as the app — good for isolating app vs Oracle issues:

```powershell
cd backend
python scripts/fetch_htd_range.py
python scripts/fetch_htd_range.py --from 2023-02-01 --to 2023-02-03
python scripts/fetch_htd_range.py --show-legs   # also print each raw HTD leg row
```

Prints **each mapped transaction live** as debit/credit pairs complete (same query + mapper as ETL).

Alternative: ask the DBA to reset the Oracle user password (`ALTER USER customer IDENTIFIED BY ...`) so a modern 11G/12C verifier is stored.

Legacy CUSTOM channel tables (offline CSV / fallback):

```env
FINACLE_ORACLE_SOURCE=channels
FINACLE_SCHEMA=CUSTOM
```

See [docs/finacle/FIELD_MAPPING.md](../docs/finacle/FIELD_MAPPING.md).

## Export API (Module 4)

Nova Bank IT pulls translated, NFIU-ready transactions using `X-API-Key` (create keys in the portal).

- `GET /api/v1/export/verify` — validate API key
- `GET /api/v1/export/summary` — eligibility counts for a date range
- `GET /api/v1/export/transactions` — paginated pull with `nfiu_payload`
- `GET /api/v1/export/transactions/{finacle_ref}` — single transaction
- `GET /api/v1/export/reports` — list generated reports
- `GET /api/v1/export/reports/{id}/download?format=xml|csv` — download report file

Interactive docs and live testing: portal → **Integration → API Docs**.

### Smoke test

```bash
# Terminal 1: start API
./scripts/start-backend.sh

# Terminal 2: run smoke (enter OTP from Terminal 1, or set SMOKE_OTP)
cd backend && PYTHONPATH=. python scripts/smoke_module4.py
```

## Scheduled ETL

Daily extraction via APScheduler (disabled by default):

```env
ETL_SCHEDULE_ENABLED=true
ETL_SCHEDULE_HOUR=2
ETL_SCHEDULE_MINUTE=0
```

## Database migrations

Alembic runs automatically on startup. Manual run:

```bash
alembic upgrade head
```

## Tests

```bash
PYTHONPATH=. python -m pytest tests/ -v
```

API docs: http://localhost:8000/docs
