# Nova Bank Compliance Sidecar
## Project Status & Completion Report

**Document type:** Status report — work completed, remaining scope, step-by-step flows  
**Client:** Nova Bank (internal use only)  
**Project:** Nova Bank Compliance Sidecar / Compliance Portal  
**Repository:** https://github.com/Divine-mercyx/NOVA-BANK-COMPLIANCE-SIDECAR  
**Report date:** 7 September 2026  
**Prepared for:** Nova Bank compliance & IT stakeholders  

---

## 1. Executive Summary

Nova Bank is building an **internal compliance sidecar** alongside **Finacle** for:

| Milestone | Purpose |
|-----------|---------|
| **M1 — Reporting** | Extract transactions, validate, stage, generate CTR/FTR/PEP/STR reports, approval workflow, audit trail |
| **M2 — Screening** | Screen transactions against watchlists, alert queue, approve/reject/escalate, performance & audit |
| **Module 4 — Integration** | Nova middleware pushes data via APIs (ingest + screening check + API keys) |

### Overall completion (estimated)

| Scope | Complete | Notes |
|-------|----------|-------|
| **Demo / prototype** (portal + ETL code + partner APIs) | **~91%** | Runnable on VPN laptop with Oracle; CSV mode for offline dev |
| **Production go-live** (NFIU filing + live screening + bank infra) | **~50%** | Blocked on goAML spec, NFIU sandbox, sanctions feeds, prod hosting |

### Bank confirmations received (September 2026)

| Item | Status |
|------|--------|
| All transactions → **TBAADM.HTD** | Confirmed by bank team |
| Customer/account details → **TBAADM.GAM** | Confirmed by bank team |
| Test data in tables | Confirmed |
| HTD/GAM column validation (sample export) | Validated — `FORACID`, `ACCT_NAME`, D/C pairing works |
| Oracle connection credentials | Provided for VPN laptop (`customer` / `NOVAPRD` @ `10.0.240.180`) |
| GitHub monorepo pushed | Done — ready to clone on VPN laptop |

---

## 2. What We Have Built (Completed Work)

### 2.1 Platform foundation

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 1 | Monorepo on GitHub | Done | Backend + frontend + docs in one repo |
| 2 | Docker Compose | Done | PostgreSQL (port 5433) + Redis (port 6380) |
| 3 | FastAPI backend | Done | REST API, OpenAPI at `/docs` |
| 4 | React frontend | Done | Light/dark theme, PalmPay-inspired auth UI |
| 5 | PostgreSQL staging warehouse | Done | Transactions, runs, reports, audit, users, API keys |
| 6 | Alembic migrations | Done | Runs on startup; additive schema changes |
| 7 | Startup scripts | Done | `scripts/start-backend.sh`, `scripts/start-frontend.sh` |
| 8 | `.env.example` | Done | Oracle HTD/GAM template for VPN laptop |

### 2.2 Authentication & team management

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 1 | Email + password login | Done | bcrypt hashing |
| 2 | OTP step | Done | Dev: printed to backend console |
| 3 | JWT sessions | Done | Role embedded in token |
| 4 | Roles | Done | viewer, analyst, approver, admin |
| 5 | Role hardening | Done | ETL/report generate = analyst+; approve/submit = approver+ |
| 6 | Team CRUD | Done | Admin: add/edit/remove staff |
| 7 | Seeded users | Done | admin, approver, analyst, viewer |

**Default admin:** `admin@novabank.ng` / `Admin@Nova2026`

### 2.3 Milestone 1 — Reporting (ETL & staging)

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 1 | ETL pipeline | Done | Extract → transform → load → audit |
| 2 | Extract mode: mock | Done | Random demo data |
| 3 | Extract mode: csv | Done | UAT CSV exports from `finacle_samples/` |
| 4 | Extract mode: oracle | Done | Code ready; VPN + credentials required |
| 5 | Oracle source: HTD + GAM | Done | Primary path — `TBAADM.HTD` joined to `TBAADM.GAM` |
| 6 | Oracle source: CUSTOM channels | Done | Legacy fallback (NIPTRANS, RTGSTRAN, etc.) |
| 7 | HTD D/C pairing | Done | Pairs by TRAN_ID + TRAN_AMT (multi-leg support) |
| 8 | Customer names from GAM | Done | `FORACID`, `ACCT_NAME`; CSV stub for offline |
| 9 | Withdrawal name parsing | Done | `PARTICULAR` / `CSHWD` / ` BY ` patterns |
| 10 | PEP registry | Done | `PEP_CUSTOMERS` — account + name lookup |
| 11 | Report flags | Done | CTR (≥₦5M), FTR (FX ≥$10k), PEP, STR |
| 12 | Staging warehouse | Done | Valid/invalid, flags, NFIU JSON payload |
| 13 | Data quality dashboard | Done | By channel, validation rate, eligibility counts |
| 14 | Withdrawal spot-check UI | Done | Parsed name vs raw PARTICULAR |
| 15 | Extraction runs + logs | Done | Per-run status, channel logs |
| 16 | Scheduled ETL | Done | APScheduler daily cron (opt-in) |
| 17 | Dashboard extract mode | Done | Shows csv/oracle/mock + last run source |

### 2.4 Milestone 1 — Regulatory reports & workflow

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 1 | Report types | Done | CTR, FTR, PEP, STR |
| 2 | Report generation | Done | Generic XML + CSV files |
| 3 | Report preview | Done | Sample transactions in UI |
| 4 | Approve / reject / submit | Done | Workflow + audit events |
| 5 | Audit trail | Done | All major actions logged |
| 6 | Unit tests | Done | PEP, HTD mapper, STR, customer registry (14 tests) |

**Not done:** Official goAML XSD validation; real NFIU portal submission.

### 2.5 Milestone 2 — Screening

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 1 | Alert queue UI | Done | Pending/all, search, detail panel |
| 2 | Approve / reject / escalate | Done | Role-gated; audit logged |
| 3 | Simulate alerts | Done | Demo/mock data |
| 4 | Performance dashboard | Done | Latency, false positive rate |
| 5 | Screening audit log | Done | Entity-level audit events |
| 6 | Sync screening API | Done | `POST /api/v1/screening/check` for middleware |

**Not done:** Live Finacle event feed; real sanctions/BVN/watchlist APIs.

### 2.6 Module 4 — Partner integration APIs

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 1 | Batch ingest API | Done | `POST /api/v1/ingest/transactions` |
| 2 | Batch status API | Done | `GET /api/v1/ingest/batches/{id}` |
| 3 | Screening check API | Done | `POST /api/v1/screening/check` |
| 4 | API key auth | Done | `X-API-Key` header, bcrypt hashed |
| 5 | API key admin UI | Done | Create/revoke keys (admin) |
| 6 | Integration docs UI | Done | curl examples, OpenAPI link |
| 7 | Smoke test script | Done | `backend/scripts/smoke_module4.py` |

### 2.7 Documentation & discovery

| # | Item | Status |
|---|------|--------|
| 1 | Full project documentation (~1,100 lines) | Done |
| 2 | Finacle field mapping (HTD/GAM) | Done |
| 3 | UAT schema discovery (261 CUSTOM tables) | Done |
| 4 | UAT CSV samples (offline dev) | Done (local, gitignored) |
| 5 | HTD sample validated against mapper | Done |
| 6 | Email to DBA (source tables) | Sent / follow-up with HTD+GAM answer |

---

## 3. Completion Matrix — Done vs Remaining

### 3.1 By workstream

| Workstream | Done | Remaining for production |
|------------|------|--------------------------|
| M1 ETL & staging | 95% | Live Oracle ETL on VPN laptop; prod scheduling; prod credentials |
| M1 Reporting engine | 85% | Official goAML XSD; NFIU sandbox submission |
| M1 Workflow & audit | 90% | Prod OTP; prod sign-off process |
| M2 Screening UI & workflow | 88% | Real watchlist data; prod SLA monitoring |
| M2 Live screening | 35% | Finacle events/webhooks; sanctions API; BVN list |
| M4 Partner APIs | 90% | Prod API keys; prod URL; middleware integration test |
| Auth & team | 92% | Email/SMS OTP; SSO (if required) |
| Infrastructure | 60% | Prod hosting; backups; monitoring; secrets management |
| **Overall demo** | **~91%** | VPN laptop first live run |
| **Overall production** | **~50%** | See Section 5 |

### 3.2 Feature checklist — production “done”

| # | Requirement | Built? | Production-ready? |
|---|-------------|--------|-------------------|
| 1 | Portal login with OTP | Yes | No — console OTP only |
| 2 | Role-based access | Yes | Yes (needs prod users) |
| 3 | Finacle extract (HTD+GAM) | Yes (code) | Pending — VPN laptop live run |
| 4 | Staging + validation | Yes | Yes |
| 5 | CTR/FTR/PEP/STR reports | Yes (generic) | No — not goAML official |
| 6 | Report approve/submit | Yes (workflow) | No — submit is audit-only, not NFIU API |
| 7 | Audit trail | Yes | Yes |
| 8 | Screening alert queue | Yes | Partial — mock/simulate + sync API |
| 9 | Middleware push (ingest) | Yes | Pending — integration test with Nova |
| 10 | API key management | Yes | Pending — prod key policy |
| 11 | Daily scheduled ETL | Yes (opt-in) | Pending — enable in prod |
| 12 | NFIU goAML compliance | No | No |
| 13 | Sanctions/watchlist feeds | No | No |
| 14 | Production hosting | No | No |
| 15 | 30-day UAT parallel run | No | No |
| 16 | Compliance sign-off | No | No |

---

## 4. Step-by-Step Flows (How the System Works)

### 4.1 Flow A — VPN laptop setup (first time)

```
Step 1   Install Docker, Git, Node.js 18+, Python 3.11+
         Verify: docker --version, node -v, python3 --version

Step 2   Connect bank VPN (Finacle Oracle must be reachable)

Step 3   Clone repository
         git clone https://github.com/Divine-mercyx/NOVA-BANK-COMPLIANCE-SIDECAR.git
         cd NOVA-BANK-COMPLIANCE-SIDECAR

Step 4   Start infrastructure
         docker compose up -d
         (Postgres :5433, Redis :6380)

Step 5   Configure Oracle
         cp backend/.env.example backend/.env
         Edit:
           FINACLE_MODE=oracle
           FINACLE_ORACLE_SOURCE=htd
           FINACLE_ADMIN_SCHEMA=TBAADM
           FINACLE_ORACLE_DSN=10.0.240.180:1625/NOVAPRD  (or :1521 if 1625 fails)
           FINACLE_ORACLE_USER=customer
           FINACLE_ORACLE_PASSWORD=<from IT>

Step 6   Terminal 1 — start backend
         chmod +x scripts/*.sh
         ./scripts/start-backend.sh
         (Creates venv, installs deps, runs API on :8000)

Step 7   Terminal 2 — start frontend
         ./scripts/start-frontend.sh
         (npm install, runs UI on :5173)

Step 8   Browser → http://localhost:5173
         Login → OTP from backend terminal → Dashboard
```

### 4.2 Flow B — Milestone 1: ETL (Finacle → staging)

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────────┐
│ TBAADM.HTD  │────►│  Extract     │────►│ Transform   │────►│ Staging DB   │
│ + TBAADM.GAM│     │  (Oracle)    │     │ Validate    │     │ PostgreSQL   │
└─────────────┘     └──────────────┘     │ PEP/CTR/FTR │     └──────────────┘
                                         │ STR flags   │
                                         └─────────────┘

Step 1   Analyst+ logs in → Dashboard → "Run extraction"
         OR POST /api/v1/etl/run

Step 2   Backend queries TBAADM.HTD LEFT JOIN TBAADM.GAM
         Filters by date range (optional)

Step 3   HTD mapper pairs debit (D) and credit (C) legs per TRAN_ID + amount
         Resolves sender/receiver names from GAM.ACCT_NAME
         Infers channel (NIP, RTGS, withdrawal, etc.)

Step 4   Transformer validates accounts (10 digits), amounts, names
         Sets report flags: CTR, FTR, PEP, STR

Step 5   Records loaded to staging_transactions
         Extraction run logged with status (success/partial/failed)
         Audit event: ETL_COMPLETED

Step 6   User verifies in UI:
         • Dashboard — counts, extract mode, last run
         • Data Quality — channel breakdown, withdrawal spot-check
         • Extraction — run logs
```

**Alternative paths:**
- **CSV mode** (`FINACLE_MODE=csv`): reads `backend/finacle_samples/*.csv` — no VPN
- **Mock mode** (`FINACLE_MODE=mock`): random demo data
- **API ingest** (Module 4): middleware POSTs batches → same transform/staging path
- **Scheduled ETL**: daily cron if `ETL_SCHEDULE_ENABLED=true`

### 4.3 Flow C — Milestone 1: Regulatory reporting

```
Staging (flagged txns) → Generate report → Review → Approve → Submit

Step 1   Analyst+ → Reports page → Generate CTR / FTR / PEP / STR
         Selects period (default: last 7 days)

Step 2   Report generator queries staging where flag = true
         Builds generic goAML-style XML + CSV
         Saves to backend/reports_output/
         Status: DRAFT

Step 3   Approver+ reviews preview sample in UI
         Approve → status APPROVED
         Reject → status REJECTED (audit logged)

Step 4   Approver+ Submit → status SUBMITTED
         Audit: REPORT_SUBMITTED
         (Currently audit-only — not uploaded to real NFIU portal)

Step 5   Audit Trail page shows full history
```

### 4.4 Flow D — Milestone 2: Screening

```
Transaction → Screen → Alert (if match) → Analyst review → Decision

Path 1 — Simulate (demo):
  Analyst+ → Screening → Simulate flags → mock alerts in queue

Path 2 — Sync API (middleware):
  POST /api/v1/screening/check with X-API-Key
  → PEP registry + keyword matching
  → decision: clear | review
  → if review: ScreeningAlert created in queue

Path 3 — Review:
  Analyst+ opens alert → Approve (false positive) / Reject / Escalate (approver+)
  → Audit logged → Performance dashboard updated
```

### 4.5 Flow E — Module 4: Middleware integration

```
Step 1   Admin → Integration → API Keys → Create key
         Copy full key (shown once): nova_...

Step 2   Middleware POST /api/v1/ingest/transactions
         Header: X-API-Key: nova_...
         Body: { batch_id, transactions[] }
         → Staged with same validation as ETL

Step 3   Middleware POST /api/v1/screening/check (pre/post transaction)
         → Sync decision + optional alert

Step 4   GET /api/v1/ingest/batches/{batch_id} for status polling

Step 5   Smoke test: backend/scripts/smoke_module4.py
```

### 4.6 Flow F — End-to-end “definition of done” (production)

```
Phase 1  VPN laptop live Oracle ETL validated
Phase 2  30-day parallel run (sidecar vs manual process)
Phase 3  goAML XSD reports pass NFIU validation
Phase 4  Test submission in NFIU sandbox
Phase 5  Real sanctions/watchlist connected to M2
Phase 6  Middleware integrated via Module 4 APIs
Phase 7  Prod hosting, OTP email/SMS, secrets, monitoring
Phase 8  Compliance officer + IT sign-off
Phase 9  Go-live
```

---

## 5. Everything Required to Mark Project COMPLETE

### 5.1 Must-have (production go-live)

| # | Task | Owner | Status |
|---|------|-------|--------|
| 1 | Live Oracle ETL from TBAADM.HTD + GAM on VPN/prod | Dev + IT | In progress — credentials received |
| 2 | Confirm Oracle port (1625 vs 1521) and read-only grants | IT/DBA | Pending |
| 3 | Validate row counts HTD vs staged after full extract | Dev | Pending |
| 4 | Official NFIU goAML XSD specification | Nova / NFIU | Pending |
| 5 | Report generator updated to pass XSD validation | Dev | Not started |
| 6 | NFIU sandbox / submission API access | Nova | Pending |
| 7 | Real submit to NFIU (not audit-only) | Dev | Not started |
| 8 | Production sanctions / watchlist source | Nova | Pending |
| 9 | BVN watchlist (if required) | Nova | Pending |
| 10 | Live screening feed (Finacle events or middleware push) | Dev + Nova | Partial (API exists) |
| 11 | Production OTP (email or SMS) | Dev + IT | Not started |
| 12 | Production hosting (VM/cloud, HTTPS, firewall) | IT | Pending |
| 13 | Secrets management (no passwords in .env files) | IT | Pending |
| 14 | Database backups & recovery | IT | Pending |
| 15 | 30-day UAT parallel run | Compliance | Not started |
| 16 | Written compliance sign-off | Compliance | Not started |

### 5.2 Should-have (strongly recommended)

| # | Task | Status |
|---|------|--------|
| 1 | Enable scheduled daily ETL in production | Code done; not enabled |
| 2 | Middleware end-to-end test with Nova team | Pending |
| 3 | More UAT data beyond migration BALANCE TRANSFER rows | Pending |
| 4 | FX / SWIFT channel coverage in HTD | Pending sample data |
| 5 | Monitoring & alerting (ETL failures, API errors) | Not started |
| 6 | Export `PSTD_DATE`, `REF_CRNCY_CODE` in HTD query (explicit dates/currency) | Optional polish |

### 5.3 Nice-to-have (post go-live)

| # | Task |
|---|------|
| 1 | SSO / Active Directory integration |
| 2 | PDF report download from UI |
| 3 | Email notifications for pending reports/alerts |
| 4 | Dashboard export to Excel |

---

## 6. Dependencies on Nova Bank

| ID | Dependency | Priority | Status |
|----|------------|----------|--------|
| D-01 | Oracle read-only access (HTD, GAM) | IMMEDIATE | Credentials provided; VPN laptop setup in progress |
| D-02 | Confirm HTD/GAM as production source | IMMEDIATE | **Confirmed** |
| D-03 | NFIU goAML format spec | HIGH | Pending |
| D-04 | NFIU sandbox credentials | HIGH | Pending |
| D-05 | Sanctions / watchlist API or file feed | HIGH | Pending |
| D-06 | Production hosting environment | HIGH | Pending |
| D-07 | SMTP/SMS for OTP | MEDIUM | Pending |
| D-08 | Compliance UAT resource (30-day parallel) | HIGH | Pending |
| D-09 | Middleware team for Module 4 integration | MEDIUM | Pending |
| D-10 | Written sign-off for go-live | HIGH | Pending |

---

## 7. Risks & Blockers

| Risk | Impact | Mitigation |
|------|--------|------------|
| VPN unavailable on dev laptop | Cannot test Oracle locally | Use VPN laptop; CSV mode offline |
| HTD test data is migration-only | Limited demo variety | Request broader UAT date range |
| goAML spec delay | Cannot file real reports | Continue generic XML; parallel spec review |
| Oracle port/credentials wrong | ETL fails | Test script in README; try 1521/1625 |
| Credentials in chat/email | Security | Rotate after setup; use .env only |

---

## 8. Immediate Next Steps (Recommended Order)

1. **VPN laptop:** Clone repo, install Node + Python, configure `.env`, run ETL  
2. **Validate:** HTD row count vs staged records; check real names in Data Quality  
3. **Demo:** Generate CTR (Hygeia ₦102M) and FTR (USD transfers) from live data  
4. **Middleware:** Run Module 4 smoke test with API key  
5. **Nova:** Request goAML XSD + NFIU sandbox access  
6. **Nova:** Confirm sanctions/watchlist provider  
7. **Plan:** 30-day parallel UAT with compliance team  

---

## 9. Repository & Technical Reference

| Item | Value |
|------|-------|
| GitHub | https://github.com/Divine-mercyx/NOVA-BANK-COMPLIANCE-SIDECAR |
| Backend | FastAPI, Python 3.11+, port 8000 |
| Frontend | React + Vite, port 5173 |
| Database | PostgreSQL 16 (Docker, port 5433) |
| Finacle source | TBAADM.HTD + TBAADM.GAM |
| Finacle mode | `oracle` (VPN) / `csv` (offline) / `mock` (demo) |
| Tests | 14 passing (`pytest tests/`) |
| API docs | http://localhost:8000/docs |

---

## 10. Summary Scorecard

```
COMPLETED (built & pushed):
  ✅ Full compliance portal (M1 + M2 + Integration UI)
  ✅ Auth, roles, team management
  ✅ ETL pipeline (mock / csv / oracle HTD+GAM)
  ✅ Staging, quality, CTR/FTR/PEP/STR flags & reports
  ✅ Screening queue, simulate, sync API
  ✅ Partner APIs (ingest, screening, API keys)
  ✅ Documentation, field mapping, GitHub monorepo
  ✅ Bank confirmed HTD + GAM architecture
  ✅ Oracle credentials for VPN laptop

IN PROGRESS:
  🔄 VPN laptop clone, install, first live Oracle ETL

NOT STARTED (production completion):
  ❌ goAML official report format
  ❌ NFIU real submission
  ❌ Production sanctions feeds
  ❌ Production OTP email/SMS
  ❌ Production hosting & ops
  ❌ 30-day UAT + compliance sign-off

PROJECT COMPLETE WHEN:
  All Section 5.1 must-have items are checked + sign-off obtained.
  Estimated: ~50% of production scope remains.
```

---

*End of report — Nova Bank Compliance Sidecar — 7 September 2026*
