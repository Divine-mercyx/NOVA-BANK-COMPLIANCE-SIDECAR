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
```

Legacy CUSTOM channel tables (offline CSV / fallback):

```env
FINACLE_ORACLE_SOURCE=channels
FINACLE_SCHEMA=CUSTOM
```

See [docs/finacle/FIELD_MAPPING.md](../docs/finacle/FIELD_MAPPING.md).

## Partner APIs (Module 4)

Machine-to-machine endpoints use `X-API-Key` (create keys in the portal or via admin API).

- `POST /api/v1/ingest/transactions`
- `GET /api/v1/ingest/batches/{batch_id}`
- `POST /api/v1/screening/check`

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
