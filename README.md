# Nova Bank — Compliance Sidecar

Internal compliance platform for NFIU regulatory reporting (M1) and transaction screening (M2). Finacle sidecar with partner push APIs (Module 4).

## VPN laptop — first-time setup

**Prerequisites:** Docker, Node.js 18+, Python 3.11+ (3.14 works), Git, VPN to Finacle Oracle.

```bash
git clone https://github.com/Divine-mercyx/NOVA-BANK-COMPLIANCE-SIDECAR.git
cd NOVA-BANK-COMPLIANCE-SIDECAR

# 1. Infrastructure (Postgres + Redis)
docker compose up -d

# 2. Backend config — copy and edit Oracle credentials
cp backend/.env.example backend/.env
# Edit backend/.env: FINACLE_ORACLE_DSN, USER, PASSWORD

# 3. Start backend (Terminal 1)
chmod +x scripts/*.sh backend/scripts/*.sh
./scripts/start-backend.sh

# 4. Start frontend (Terminal 2)
./scripts/start-frontend.sh
```

Open **http://localhost:5173**

| Login | Value |
|-------|-------|
| Email | `admin@novabank.ng` |
| Password | `Admin@Nova2026` |
| OTP | Printed in **backend terminal** after login |

Then: **Dashboard → Run extraction** (pulls from `TBAADM.HTD` + `TBAADM.GAM` when `FINACLE_MODE=oracle`).

## Dev laptop (no VPN)

Use CSV mode with UAT exports in `backend/finacle_samples/`:

```env
FINACLE_MODE=csv
```

Copy sample CSVs from UAT exports (see `docs/finacle/FIELD_MAPPING.md`).

## Project structure

```
├── backend/          FastAPI API, ETL, reports, screening, partner APIs
├── frontend/         React compliance portal
├── docs/             Project documentation + Finacle field mapping
├── docker-compose.yml
└── scripts/          start-backend.sh, start-frontend.sh
```

## Other logins (seeded)

| Role | Email | Password |
|------|-------|----------|
| Approver | approver@novabank.ng | Approver@Nova2026 |
| Analyst | analyst@novabank.ng | Analyst@Nova2026 |
| Viewer | viewer@novabank.ng | Viewer@Nova2026 |

## API docs

http://localhost:8000/docs

## Tests

```bash
cd backend
PYTHONPATH=. .venv/bin/python -m pytest tests/ -v
```

## Documentation

- [Full project doc](docs/NOVA_COMPLIANCE_PROJECT_DOCUMENTATION.md)
- [Finacle HTD/GAM mapping](docs/finacle/FIELD_MAPPING.md)
- [Backend README](backend/README.md)
