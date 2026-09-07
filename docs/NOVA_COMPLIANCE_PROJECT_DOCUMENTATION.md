# Nova Bank — Compliance Sidecar Platform
## Complete Project Documentation

**Document purpose:** Comprehensive reference for Nova Bank stakeholders. Intended to be fed into presentation-generation tools (slides, executive briefings, status reviews).

**Client:** Nova Bank (internal use only — not a multi-tenant SaaS product)

**Project name:** Nova Bank Compliance Portal (working title)

**Last updated:** July 2026

**Document version:** 1.0

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Business Context & Objectives](#2-business-context--objectives)
3. [Solution Overview](#3-solution-overview)
4. [System Architecture](#4-system-architecture)
5. [Milestone 1 — NFIU Regulatory Reporting](#5-milestone-1--nfiu-regulatory-reporting)
6. [Milestone 2 — Real-Time Transaction Screening](#6-milestone-2--real-time-transaction-screening)
7. [Platform Features (Cross-Cutting)](#7-platform-features-cross-cutting)
8. [User Roles & Permissions](#8-user-roles--permissions)
9. [End-to-End Workflows](#9-end-to-end-workflows)
10. [Technical Stack & Repositories](#10-technical-stack--repositories)
11. [Current Build Status](#11-current-build-status)
12. [Dependencies & Requirements from Nova Bank](#12-dependencies--requirements-from-nova-bank)
13. [Blockers & Risks](#13-blockers--risks)
14. [Implementation Roadmap & Phases](#14-implementation-roadmap--phases)
15. [Completion Estimates](#15-completion-estimates)
16. [UAT & Go-Live Criteria](#16-uat--go-live-criteria)
17. [Glossary](#17-glossary)

---

## 1. Executive Summary

Nova Bank is building an **internal compliance sidecar platform** that sits alongside its **Finacle core banking system**. The platform has two major milestones:

| Milestone | Name | Purpose |
|-----------|------|---------|
| **Milestone 1 (M1)** | NFIU Regulatory Reporting | Extract transaction data from Finacle, validate and stage it, generate CTR/FTR/PEP regulatory reports, manage approval workflows, and prepare submissions to the Nigerian Financial Intelligence Unit (NFIU). |
| **Milestone 2 (M2)** | Real-Time Transaction Screening | Screen transactions and onboarding events against sanctions lists, PEP registries, internal watchlists, and BVN watchlists; manage alert queues; track performance and audit decisions. |

### What exists today

A **working demo application** is built with:
- Full frontend portal (React) with separate navigation for M1 Reporting, M2 Screening, and **Integration (Module 4)**
- Backend API (FastAPI) with PostgreSQL staging warehouse, Redis, authentication, audit logging
- **Finacle extract in three modes:** `mock` (demo), `csv` (UAT sample exports), `oracle` (live CUSTOM schema — code ready, VPN required)
- **Partner push APIs:** batch transaction ingest, synchronous screening check, API key management
- PEP registry from `PEP_CUSTOMERS.csv`, customer name stub for NIP/RTGS (`CUSTOMER_NAMES.csv`)
- Scheduled daily ETL (APScheduler, opt-in via `ETL_SCHEDULE_ENABLED`)
- Alembic database migrations
- Generic XML/CSV report output including **CTR, FTR, PEP, STR** (not yet official goAML/NFIU schema)

### What is blocked

Production go-live still depends on **Nova Bank inputs**:
- DBA confirmation of source tables and production customer name table (GAM/CIF join)
- VPN / Oracle UAT access on the primary dev environment
- Official NFIU goAML XSD spec and sandbox submission API
- Real sanctions/watchlist feeds for M2
- Production OTP delivery (email/SMS) and hosting

### High-level completion estimate

| Scope | Estimated completion |
|-------|---------------------|
| Demo / internal prototype (CSV + mock + partner APIs) | **~90–92%** |
| Production go-live (real Finacle + NFIU filing) | **~48–52%** |

---

## 2. Business Context & Objectives

### 2.1 Why Nova Bank needs this

Nova Bank must comply with **anti-money laundering (AML)** and **counter-terrorist financing (CTF)** regulations enforced by **NFIU**. Core obligations include:

- Identifying and reporting **Cash Transaction Reports (CTR)** for large NGN cash/non-cash transactions
- Filing **Foreign Transaction Reports (FTR)** for cross-border / foreign currency transactions above thresholds
- Reporting **Politically Exposed Persons (PEP)** and suspicious activity
- Screening customers and transactions against **sanctions** and **watchlists** in near real time

Finacle is the system of record for transactions, but it is **not designed as a standalone compliance filing and screening portal**. This project provides a dedicated **compliance sidecar** for Nova Bank staff.

### 2.2 What this is NOT

- **Not** a SaaS product for other banks to plug into
- **Not** a replacement for Finacle
- **Not** currently connected to live NFIU submission APIs
- **Not** using official goAML XSD schemas yet (reports use a simplified internal XML format)

### 2.3 Success criteria (definition of done)

**Milestone 1 success:**
- Automated daily (or on-demand) extract from Finacle UAT/production read replica
- Staged warehouse with validation and quality metrics
- CTR, FTR, PEP reports generated in NFIU-accepted format
- Compliance officer review → approver sign-off → submission to NFIU
- Full audit trail for regulators and internal audit

**Milestone 2 success:**
- Real-time screening on Finacle transaction events (< 50ms target latency in design)
- Alerts routed to compliance queue with approve / reject / escalate workflow
- Integration with sanctions/PEP/BVN/internal watchlist sources
- Performance dashboards and screening audit logs

---

## 3. Solution Overview

### 3.1 Conceptual diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        NOVA BANK COMPLIANCE PORTAL                       │
│                     (Internal Web Application)                         │
├──────────────────────────────┬──────────────────────────────────────────┤
│   MILESTONE 1 · REPORTING    │   MILESTONE 2 · SCREENING                │
│   ─────────────────────      │   ───────────────────────                │
│   Dashboard                  │   Alert Queue                            │
│   Extraction (ETL)           │   Performance                            │
│   Data Quality               │   Screening Log                          │
│   Reports (CTR/FTR/PEP)    │                                          │
│   Audit Trail                │                                          │
│   Team Management            │                                          │
└──────────────┬───────────────┴──────────────────┬───────────────────────┘
               │                                   │
               ▼                                   ▼
┌──────────────────────────┐         ┌──────────────────────────┐
│   STAGING WAREHOUSE      │         │   SCREENING ENGINE       │
│   PostgreSQL             │         │   + Alert Store          │
│   (transactions, reports,│         │   (PostgreSQL)           │
│    audit events)         │         │                          │
└──────────────┬───────────┘         └──────────────┬───────────┘
               │                                     │
               ▼                                     ▼
┌──────────────────────────┐         ┌──────────────────────────┐
│   FINACLE (Oracle)       │         │   WATCHLIST SOURCES      │
│   Read replica / API     │         │   Sanctions, PEP, BVN,   │
│   [NOT CONNECTED YET]    │         │   Internal lists         │
│                          │         │   [NOT CONNECTED YET]    │
└──────────────────────────┘         └──────────────────────────┘
               │
               ▼
┌──────────────────────────┐
│   NFIU                     │
│   Report submission        │
│   [NOT CONNECTED YET]      │
└──────────────────────────┘
```

### 3.2 Application modules at a glance

| Module | Milestone | Description |
|--------|-----------|-------------|
| Authentication & OTP | Both | Email/password login + one-time password verification |
| Team Management | Both | Admin creates, edits, removes staff with role-based access |
| ETL Extract | M1 | Pull transactions from Finacle by channel and date range |
| Transform & Validate | M1 | Cleanse data, apply CTR/FTR/PEP rules, flag invalid records |
| Staging Warehouse | M1 | PostgreSQL store for extracted transactions |
| Data Quality Analytics | M1 | Validity rates, error breakdowns, channel statistics |
| Report Generator | M1 | Build CTR/FTR/PEP XML and CSV files from staged data |
| Report Workflow | M1 | Draft → review → approve → submit lifecycle |
| Audit Trail | M1 + M2 | Immutable log of user and system actions |
| Screening Engine | M2 | Match transactions against watchlists, create alerts |
| Alert Queue | M2 | Pending alerts with approve/reject/escalate |
| Screening Performance | M2 | Latency, false positive rate, breakdown by list |

---

## 4. System Architecture

### 4.1 Components

| Layer | Technology | Responsibility |
|-------|------------|----------------|
| **Frontend** | React 18, Vite, TypeScript, Tailwind CSS | Nova Bank staff portal; light/dark mode; expandable sidebar |
| **Backend API** | Python 3.11, FastAPI | REST API, business logic, auth, ETL orchestration |
| **Staging DB** | PostgreSQL 15 (Docker, port 5433) | Users, transactions, reports, alerts, audit |
| **Cache / Queue** | Redis (Docker, port 6380) | Reserved for future job queues and caching |
| **Finacle source** | Oracle DB (read replica) | Production data source — **pending integration** |
| **Report files** | Local filesystem (`reports_output/`) | Generated XML/CSV — will move to secure storage in production |

### 4.2 Repositories

| Repository | Purpose | GitHub (target) |
|------------|---------|-----------------|
| **Nova-Middleware** | Backend API | `github.com/Divine-mercyx/Nova-Middleware` |
| **Nova-Middleware-Interface** | Frontend UI | `github.com/Divine-mercyx/Nova-Middleware-Interface` |

Both repos live under `~/Projects/nova-compliance/backend` and `~/Projects/nova-compliance/frontend` locally.

### 4.3 Security model (current)

| Control | Status |
|---------|--------|
| Password hashing (bcrypt) | Implemented |
| JWT session tokens | Implemented |
| OTP on login | Implemented (console output in dev; email/SMS pending) |
| Role-based API access | Partial (admin-only staff APIs; broader role enforcement planned) |
| HTTPS / TLS | Required for production deployment |
| Secrets in environment variables | Supported via `.env` |
| VPN / network isolation | Required for Finacle access — **blocked** |

### 4.4 Reporting thresholds (configurable)

| Report type | Rule (current defaults) |
|-------------|-------------------------|
| **CTR** | NGN transactions ≥ ₦5,000,000 |
| **FTR** | Non-NGN (foreign currency) transactions ≥ $10,000 USD equivalent |
| **PEP** | Sender or receiver name matches PEP keyword list (demo heuristic) |

### 4.5 Supported transaction channels (M1 extract)

| Channel | Description |
|---------|-------------|
| NIP | Nigeria Instant Payment |
| SWIFT | International wire |
| RTGS | Real Time Gross Settlement |
| NEFT | National Electronic Funds Transfer |
| NAPS | Nigeria Automated Payment System |
| CASH_DEPOSIT | Branch cash deposit |
| CASH_WITHDRAWAL | Branch cash withdrawal |
| MOBILE | Mobile banking / wallet |

---

## 5. Milestone 1 — NFIU Regulatory Reporting

### 5.1 M1 objective

Automate the end-to-end pipeline from **Finacle transaction data** to **NFIU-ready regulatory reports**, with validation, staging, human approval, and auditability.

### 5.2 M1 sub-modules (detailed)

---

#### Module 1.1 — ETL Extract Layer

**Purpose:** Pull raw transaction records from Finacle for a given date range and channel set.

**How it works today (mock mode):**
1. User triggers extraction from the **Extraction** page (or via API `POST /api/v1/etl/run`)
2. System generates synthetic transactions per channel with realistic amounts
3. Each record includes: Finacle reference, channel, date, amount, currency, sender/receiver names and accounts, branch code, narration

**How it will work in production:**
1. Connect to Finacle Oracle read replica using read-only credentials
2. Query documented views/tables for each channel type
3. Map Finacle columns to internal `RawTransaction` schema
4. Return records to the transform layer

**API endpoints:**
- `POST /api/v1/etl/run` — Start extraction
- `GET /api/v1/etl/runs` — List recent extraction runs
- `GET /api/v1/etl/runs/{run_id}/logs` — View run logs

**Frontend page:** `/extraction`

**Status:** Mock complete ✅ | Oracle integration ❌ blocked on Finacle access

---

#### Module 1.2 — Transform & Cleanse Layer

**Purpose:** Validate each raw transaction and normalize it to NFIU-oriented structure.

**Validation rules:**
- Amount must be positive
- Sender and receiver names required
- Account numbers must be 10 digits (Nigerian format)
- CTR/FTR/PEP flags computed from thresholds and PEP keyword matching

**Output per transaction:**
- `is_valid` boolean
- `validation_errors` array (if invalid)
- `nfiu_payload` JSON object with reporting entity, reference, dates, amounts, originator, beneficiary, report flags

**Reporting entity code:** `NOVA_BANK_NG`

**Status:** Complete for mock data ✅ | Field mapping may change once real Finacle schema is known

---

#### Module 1.3 — Load & Staging Warehouse

**Purpose:** Persist all extracted transactions (valid and invalid) into PostgreSQL for reporting and quality analysis.

**Database tables:**
- `extraction_runs` — run metadata (status, counts, channels, timestamps)
- `extraction_logs` — per-run log lines (INFO, WARN, ERROR)
- `staging_transactions` — individual transaction records with validation and report flags

**Run statuses:**
- `running` — in progress
- `success` — all records valid
- `partial` — mix of valid and invalid
- `failed` — extraction or load error

**Status:** Complete ✅

---

#### Module 1.4 — Reporting Engine

**Purpose:** Generate regulatory report files from staged transactions for a given period and report type.

**Supported report types:**
| Type | Full name | Source flag |
|------|-----------|-------------|
| CTR | Cash Transaction Report | `reportable_ctr = true` |
| FTR | Foreign Transaction Report | `reportable_ftr = true` |
| PEP | Politically Exposed Person Report | `reportable_pep = true` |
| STR | Suspicious Transaction Report | Placeholder (uses CTR flag in current code) |

**Output files per report:**
- `.xml` — structured report (currently simplified goAML-like format, **not official NFIU XSD**)
- `.csv` — flat export for review

**API endpoints:**
- `POST /api/v1/reports/generate`
- `GET /api/v1/reports`
- `GET /api/v1/reports/{report_id}`

**Frontend page:** `/reports`

**Status:** Demo format complete ✅ | Official goAML 4.5/5.0 (CTR/FTR) and 3.1+ (STR) compliance ❌ pending NFIU spec

---

#### Module 1.5 — Report Workflow & Approval

**Purpose:** Human-in-the-loop review before NFIU submission.

**Report lifecycle:**
```
DRAFT → PENDING_REVIEW → APPROVED → SUBMITTED
                ↓
            REJECTED
```

**API endpoints:**
- `POST /api/v1/reports/{id}/approve`
- `POST /api/v1/reports/{id}/reject`
- `POST /api/v1/reports/{id}/submit`

**Status:** Workflow logic implemented ✅ | Real NFIU submission endpoint ❌ not connected

---

#### Module 1.6 — Data Quality & Analytics

**Purpose:** Give compliance analysts visibility into extraction health.

**Metrics provided:**
- Total staged transactions
- Valid vs invalid counts and percentages
- Breakdown by channel
- Common validation error types

**API endpoints:**
- `GET /api/v1/analytics/quality`
- `GET /api/v1/staging/transactions`

**Frontend page:** `/quality`

**Status:** Complete ✅

---

#### Module 1.7 — Dashboard (M1 overview)

**Purpose:** Single-pane view of pipeline health and recent activity.

**Widgets / data points:**
- Pipeline status (idle / running / success / partial / failed)
- Last extraction run summary
- Total staged transactions
- Pending vs submitted reports count
- Data quality snapshot
- Recent audit events (last 8)

**API endpoint:** `GET /api/v1/dashboard`

**Frontend page:** `/` (home)

**Status:** Complete ✅

---

#### Module 1.8 — Audit Trail (M1)

**Purpose:** Regulator-ready log of all significant actions.

**Logged actions include:**
- `ETL_COMPLETED`
- `REPORT_GENERATED`
- Report approve / reject / submit events
- `LOGIN_SUCCESS`
- `STAFF_CREATED`, `STAFF_UPDATED`, `STAFF_REMOVED`

**API endpoint:** `GET /api/v1/audit`

**Frontend page:** `/audit`

**Status:** Complete ✅

---

### 5.3 M1 frontend navigation

| Menu item | Route | Module |
|-----------|-------|--------|
| Dashboard | `/` | 1.7 |
| Extraction | `/extraction` | 1.1, 1.3 |
| Data Quality | `/quality` | 1.6 |
| Reports | `/reports` | 1.4, 1.5 |
| Audit Trail | `/audit` | 1.8 |
| Team | `/users` | Platform (Section 7) |

---

### 5.4 M1 step-by-step operational flow

**Step 1 — Login**
- Compliance officer opens Nova Bank Compliance Portal
- Enters email and password
- Enters OTP (currently printed to backend console in development)

**Step 2 — Run extraction**
- Analyst navigates to Extraction page
- Selects channels (or all) and date range
- Clicks run — system extracts from Finacle (mock today)
- Views run status, record counts, and logs

**Step 3 — Review data quality**
- Analyst opens Data Quality page
- Reviews invalid records and error patterns
- Works with operations/IT to fix source data issues if needed

**Step 4 — Generate reports**
- Analyst opens Reports page
- Selects report type (CTR / FTR / PEP) and reporting period
- System generates XML + CSV from valid flagged transactions
- Report saved as DRAFT with preview sample

**Step 5 — Review and approve**
- Approver reviews report preview and file contents
- Approves or rejects with notes
- Approved reports move to APPROVED status

**Step 6 — Submit to NFIU**
- Approver submits report (marks as SUBMITTED in system)
- **Future:** automatic upload to NFIU portal/API

**Step 7 — Audit**
- All steps recorded in Audit Trail for internal audit and regulatory inspection

---

## 6. Milestone 2 — Real-Time Transaction Screening

### 6.1 M2 objective

Screen transactions and onboarding events against watchlists **in near real time**, surface matches as alerts, and let compliance officers resolve them with full auditability.

### 6.2 M2 sub-modules (detailed)

---

#### Module 2.1 — Screening Engine

**Purpose:** Evaluate transactions against multiple watchlist sources and produce match alerts.

**Watchlist sources (designed for, not all connected):**
- Global Sanctions List
- Nigeria Sanctions List
- PEP Registry
- Internal Watchlist
- BVN Watchlist (CBN)
- OFAC SDN
- UN Consolidated List

**Screening types:**
- `transaction` — real-time payment screening
- `onboarding` — new customer KYC screening

**Alert fields:**
- Finacle reference, sender/receiver, amount, currency, channel
- Watchlist source, matched name, match score (%)
- Latency in milliseconds
- Status, reviewer, notes, timestamps

**How it works today:**
- `POST /api/v1/screening/simulate` generates mock alerts for demo
- No live Finacle webhook or message bus integration

**How it will work in production:**
- Finacle (or middleware bus) sends transaction events to screening API
- Engine queries sanctions/PEP/BVN providers or local cached lists
- Matches above threshold create PENDING alerts in queue
- Target latency: sub-50ms (design goal)

**Status:** Mock simulation complete ✅ | Live integration ❌ blocked on Finacle API + watchlist access

---

#### Module 2.2 — Alert Queue

**Purpose:** Compliance officers review and action pending screening hits.

**Officer actions:**
- **Approve** — false positive / cleared
- **Reject** — confirmed block or escalation needed
- **Escalate** — send to senior compliance / MLRO

**API endpoints:**
- `GET /api/v1/screening/alerts`
- `GET /api/v1/screening/alerts/{id}`
- `POST /api/v1/screening/alerts/{id}/approve`
- `POST /api/v1/screening/alerts/{id}/reject`
- `POST /api/v1/screening/alerts/{id}/escalate`

**Frontend page:** `/screening`

**Status:** Complete for mock alerts ✅

---

#### Module 2.3 — Screening Dashboard & Performance

**Purpose:** Monitor screening operations health.

**Dashboard metrics:**
- Pending alerts count
- Total screened today
- Escalated count
- Average latency (ms)
- False positive rate (%)
- Resolved today count

**Performance breakdowns:**
- Alerts by watchlist source
- Alerts by status
- Recent latency samples

**API endpoints:**
- `GET /api/v1/screening/dashboard`
- `GET /api/v1/screening/performance`

**Frontend pages:** `/screening/performance`

**Status:** Complete for mock data ✅

---

#### Module 2.4 — Screening Audit Log

**Purpose:** Separate audit view for screening-specific events.

**Logged actions:**
- `SCREENING_SIMULATED`
- `ALERT_APPROVED`, `ALERT_REJECTED`, `ALERT_ESCALATED`

**API endpoint:** `GET /api/v1/screening/audit`

**Frontend page:** `/screening/audit`

**Status:** Complete ✅

---

### 6.3 M2 frontend navigation

| Menu item | Route | Module |
|-----------|-------|--------|
| Alert Queue | `/screening` | 2.2 |
| Performance | `/screening/performance` | 2.3 |
| Screening Log | `/screening/audit` | 2.4 |

---

### 6.4 M2 step-by-step operational flow (target production)

**Step 1 — Transaction occurs in Finacle**
- Customer initiates transfer, deposit, or onboarding

**Step 2 — Event sent to screening engine**
- Finacle webhook or integration bus delivers transaction payload

**Step 3 — Watchlist matching**
- Engine checks sender/receiver names and identifiers against all configured lists
- Match score computed; hits above threshold create alerts

**Step 4 — Alert appears in queue**
- Compliance officer sees PENDING alert with match details

**Step 5 — Officer decision**
- Approve (clear), reject (block), or escalate

**Step 6 — Audit & reporting**
- Decision logged; escalated cases may feed into STR workflow (M1)

---

## 7. Platform Features (Cross-Cutting)

### 7.1 Authentication

| Step | Detail |
|------|--------|
| 1 | User submits email + password to `POST /api/v1/auth/login` |
| 2 | System validates credentials, generates 6-digit OTP |
| 3 | OTP delivered (dev: backend console; prod: email/SMS — **not built**) |
| 4 | User submits OTP to `POST /api/v1/auth/verify-otp` |
| 5 | System returns JWT access token |
| 6 | Token used for all subsequent API calls |

**Seeded development accounts:**

| Email | Role | Password (dev only) |
|-------|------|---------------------|
| admin@novabank.ng | Admin | Admin@Nova2026 |
| approver@novabank.ng | Approver | Approver@Nova2026 |
| analyst@novabank.ng | Analyst | Analyst@Nova2026 |
| viewer@novabank.ng | Viewer | Viewer@Nova2026 |

### 7.2 Team management

**Admin capabilities:**
- Add new staff member (email, name, role, temporary password)
- Edit staff (name, email, role, password reset, reactivate)
- Remove staff (soft delete — sets `is_active = false`)
- View active and removed members with search and KPI cards

**Safeguards:**
- Admin cannot demote or deactivate themselves
- Cannot remove or demote the last active admin

**API endpoints:**
- `POST /api/v1/auth/staff`
- `PATCH /api/v1/auth/staff/{user_id}`
- `DELETE /api/v1/auth/staff/{user_id}`
- `GET /api/v1/users`

**Frontend page:** `/users`

### 7.3 UI/UX features

- Purple Nova Bank brand theme
- Light and dark mode toggle
- Expandable sidebar (72px collapsed / 240px expanded)
- Two clearly labeled sidebar sections: **Milestone 1 · Reporting** and **Milestone 2 · Screening**
- Login page: split-screen design (marketing panel + form) branded as **Nova Bank · Internal compliance portal**

---

## 8. User Roles & Permissions

### 8.1 Role definitions

| Role | Intended user | Primary responsibilities |
|------|---------------|-------------------------|
| **Admin** | IT / compliance system administrator | Manage team accounts, full platform access, system configuration (future) |
| **Approver** | Senior compliance officer / MLRO | Approve and submit regulatory reports; resolve escalated screening alerts |
| **Analyst** | Compliance analyst | Run ETL extractions, review data quality, generate draft reports, action screening alerts |
| **Viewer** | Internal audit / read-only stakeholders | View dashboards, reports, and audit trails without making changes |

### 8.2 Permission matrix (target state)

| Action | Viewer | Analyst | Approver | Admin |
|--------|--------|---------|----------|-------|
| View dashboard | ✅ | ✅ | ✅ | ✅ |
| Run ETL extraction | ❌ | ✅ | ✅ | ✅ |
| View data quality | ✅ | ✅ | ✅ | ✅ |
| Generate reports | ❌ | ✅ | ✅ | ✅ |
| Approve / submit reports | ❌ | ❌ | ✅ | ✅ |
| View audit trail | ✅ | ✅ | ✅ | ✅ |
| Action screening alerts | ❌ | ✅ | ✅ | ✅ |
| Manage team | ❌ | ❌ | ❌ | ✅ |

**Note:** Role enforcement is fully implemented for staff management APIs. Broader per-route role checks across all compliance endpoints are planned for hardening.

### 8.3 Nova Bank contacts needed (operational roles)

| Role at Nova | Why needed |
|--------------|------------|
| **Compliance team lead / MLRO** | UAT sign-off, approver workflows, report validation |
| **Finacle DBA / core banking IT** | Schema docs, read replica access, extract query validation |
| **Network / VPN administrator** | Remote or on-site access to Finacle environment |
| **InfoSec / IAM** | Production credentials, OTP email/SMS, deployment security |
| **NFIU liaison** | Reporting format confirmation, sandbox access, submission credentials |

---

## 9. End-to-End Workflows

### 9.1 M1 daily reporting workflow

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  FINACLE    │───▶│  EXTRACT    │───▶│  TRANSFORM  │───▶│   STAGE     │
│  (Oracle)   │    │  (Module    │    │  + VALIDATE │    │  (Postgres) │
│             │    │   1.1)      │    │  (Module    │    │  (Module    │
│             │    │             │    │   1.2)      │    │   1.3)      │
└─────────────┘    └─────────────┘    └─────────────┘    └──────┬──────┘
                                                                 │
                    ┌─────────────┐    ┌─────────────┐           │
                    │  SUBMIT TO  │◀───│  APPROVE    │◀──────────┤
                    │  NFIU       │    │  (Officer)  │    ┌──────▼──────┐
                    │  (future)   │    │             │    │  GENERATE   │
                    └─────────────┘    └─────────────┘    │  REPORT     │
                                                          │  (Module    │
                                                          │   1.4)      │
                                                          └─────────────┘
```

### 9.2 M2 real-time screening workflow

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  FINACLE    │───▶│  SCREENING  │───▶│  ALERT      │───▶│  OFFICER    │
│  Transaction│    │  ENGINE     │    │  QUEUE      │    │  DECISION   │
│  Event      │    │  (Module    │    │  (Module    │    │  Approve /  │
│             │    │   2.1)      │    │   2.2)      │    │  Reject /   │
└─────────────┘    └──────┬──────┘    └─────────────┘    │  Escalate   │
                          │                                └──────┬──────┘
                          ▼                                       │
                   ┌─────────────┐                                ▼
                   │  WATCHLISTS │                         ┌─────────────┐
                   │  Sanctions  │                         │  AUDIT LOG  │
                   │  PEP, BVN   │                         │  (Module    │
                   │  Internal   │                         │   2.4)      │
                   └─────────────┘                         └─────────────┘
```

---

## 10. Technical Stack & Repositories

### 10.1 Backend (`Nova-Middleware`)

```
backend/
├── app/
│   ├── main.py                 # FastAPI application entry
│   ├── api/routes/
│   │   ├── auth.py             # Login, OTP, staff management
│   │   ├── compliance.py       # M1 endpoints
│   │   └── screening.py        # M2 endpoints
│   ├── core/
│   │   ├── config.py           # Settings (thresholds, DB, Finacle mode)
│   │   ├── database.py         # SQLAlchemy async engine
│   │   └── security.py         # bcrypt, JWT, OTP
│   ├── models/entities.py      # Database models
│   ├── schemas/                # Pydantic request/response models
│   ├── services/
│   │   ├── etl/                # Extract, transform, pipeline
│   │   ├── reports/            # Report generator
│   │   ├── screening/          # Screening engine
│   │   └── analytics.py        # Quality metrics, audit, workflow
│   └── seed/bootstrap.py       # Admin + demo users
├── docker-compose.yml          # PostgreSQL + Redis
├── requirements.txt
└── reports_output/             # Generated XML/CSV files
```

### 10.2 Frontend (`Nova-Middleware-Interface`)

```
frontend/
├── src/
│   ├── pages/
│   │   ├── AuthPages.tsx       # Login + OTP
│   │   ├── DashboardPage.tsx
│   │   ├── ExtractionPage.tsx
│   │   ├── QualityPage.tsx
│   │   ├── ReportsPage.tsx
│   │   ├── AuditPage.tsx
│   │   ├── UsersPage.tsx
│   │   └── screening/          # M2 pages
│   ├── components/Layout.tsx     # Sidebar + header
│   └── lib/api.ts              # API client
└── package.json
```

### 10.3 How to run locally

**Backend:**
```bash
cd backend
docker compose up -d
python3.11 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
# Opens http://localhost:5173
```

**API documentation:** http://localhost:8000/docs

---

## 11. Current Build Status

### 11.1 Feature completion matrix

| Feature | M1/M2 | Built | Mock/Live | Notes |
|---------|-------|-------|-----------|-------|
| Login + OTP | Both | ✅ | Dev OTP only | Email/SMS pending |
| JWT auth | Both | ✅ | Live | |
| Team CRUD | Both | ✅ | Live | Admin only |
| Role hardening | Both | ✅ | Live | ETL analyst+; approve approver+ |
| Dashboard | M1 | ✅ | Live | Shows extract mode + run source |
| ETL extract | M1 | ✅ | **CSV + mock** | Oracle coded; VPN to validate |
| Scheduled ETL | M1 | ✅ | Opt-in | APScheduler daily cron |
| Transform/validate | M1 | ✅ | Live | CTR/FTR/PEP/STR flags |
| Customer name join | M1 | ✅ | **Stub CSV** | Pending DBA table confirm |
| Staging warehouse | M1 | ✅ | Live | Alembic migrations |
| Data quality | M1 | ✅ | Live | Withdrawal name spot-check |
| Report generation | M1 | ✅ | **Generic XML** | CTR/FTR/PEP/STR |
| Report workflow | M1 | ✅ | Live | No real NFIU submit |
| Audit trail | M1 | ✅ | Live | |
| Partner ingest API | M4 | ✅ | Live | X-API-Key auth |
| Partner screening API | M4 | ✅ | Live | Sync check + alert creation |
| API key management | M4 | ✅ | Live | Admin UI |
| Screening simulate | M2 | ✅ | **Mock** | |
| Alert queue | M2 | ✅ | Live | |
| Screening performance | M2 | ✅ | Live | |
| Screening audit | M2 | ✅ | Live | |
| Finacle Oracle extract | M1 | ⚠️ | Code ready | Blocked on VPN UAT |
| Finacle webhooks | M2 | ❌ | — | Blocked |
| Sanctions API | M2 | ❌ | — | Decision pending |
| NFIU submission | M1 | ❌ | — | Sandbox not connected |
| Production OTP email | Both | ❌ | — | SMTP/SES pending |

### 11.2 What works in a demo today

A Nova Bank stakeholder can:
1. Log in to the compliance portal with OTP
2. Run a mock Finacle extraction across all channels
3. See staged transactions with CTR/FTR/PEP flags
4. Review data quality metrics and invalid records
5. Generate CTR, FTR, or PEP reports (XML + CSV download)
6. Walk through approve/reject/submit workflow
7. View full audit trail
8. Manage team members (admin)
9. Simulate screening alerts and approve/reject/escalate them
10. View screening performance dashboards

---

## 12. Dependencies & Requirements from Nova Bank

### 12.1 Dependency register (full list)

| ID | Dependency | Milestone | Priority | Target timing | Status | Owner at Nova |
|----|------------|-----------|----------|---------------|--------|---------------|
| D-01 | Finacle test DB + read-only credentials | M1 | **IMMEDIATE** | Week 1 | **BLOCKED** — VPN maxed | Core banking IT / DBA |
| D-02 | Finacle schema documentation (tables, views, field dictionary) | M1 | **IMMEDIATE** | Week 1 | **PENDING** | Finacle team |
| D-03 | Sample transaction data export (100+ records, anonymized CSV/JSON) | M1 | **IMMEDIATE** | Week 1 | **PENDING** | DBA / operations |
| D-04 | NFIU reporting format specification (goAML XSD, field requirements) | M1 | **IMMEDIATE** | Week 1 | **PENDING** | Compliance / NFIU liaison |
| D-05 | Compliance team contact list (MLRO, approvers, analysts) | M1 | **IMMEDIATE** | Week 1 | **PENDING** | Compliance head |
| D-06 | VPN access OR on-site office network access | M1, M2 | **IMMEDIATE** | Week 1 | **BLOCKED** — slots full; on-site option offered | Network / IT |
| D-07 | Sanctions API decision (buy vs build vs third-party) | M2 | Week 2–4 | **PENDING** | Compliance + IT |
| D-08 | Sanctions / PEP data source access (API keys, licensing) | M2 | Week 2–4 | **PENDING** | Compliance |
| D-09 | BVN watchlist setup (CBN request process) | M2 | Week 2–4 | **PENDING** | Compliance / legal |
| D-10 | Internal watchlist migration plan and data export | M2 | Week 2–4 | **PENDING** | Compliance ops |
| D-11 | Email service setup (SMTP / AWS SES / SendGrid) for OTP and alerts | Both | Week 7–8 | **PENDING** | InfoSec / IT |
| D-12 | Finacle API / webhook endpoints for real-time screening | M2 | Week 7–8 | **PENDING** | Core banking IT |
| D-13 | NFIU sandbox / staging environment access | M1 | Week 10–11 | **PENDING** | Compliance |
| D-14 | NFIU submission credentials and certificates | M1 | Week 10–11 | **PENDING** | Compliance |
| D-15 | UAT data load and pre-flagged test parties | Both | Week 11–12 | **PENDING** | Compliance + DBA |
| D-16 | Production hosting environment (VM/cloud, SSL, backups) | Both | Pre go-live | **PENDING** | IT infrastructure |
| D-17 | Regulatory sign-off for go-live | Both | Pre go-live | **PENDING** | MLRO / compliance head |

### 12.2 Minimum package to unblock M1 real extract (without VPN)

If VPN cannot be provisioned, Nova IT can deliver these **without remote network access**:

1. **Schema documentation** — PDF or spreadsheet listing:
   - Table/view names for transactions by channel
   - Column names, data types, sample values
   - Primary keys, date fields, branch codes

2. **Anonymized sample export** — CSV or JSON with 100–500 rows covering:
   - All channels (NIP, SWIFT, RTGS, cash, mobile)
   - CTR-eligible amounts (≥ ₦5M)
   - FTR-eligible foreign currency (≥ $10K)
   - PEP-like name patterns
   - Invalid edge cases (missing fields, bad account numbers)

3. **Optional periodic file drops** — daily/weekly export to SFTP or SharePoint until VPN opens

4. **On-site session** — developer visits Nova office, connects to internal network, runs schema discovery scripts, exports mapping documentation

### 12.3 Data request field list (for sample export)

Minimum columns needed per transaction:

| Field | Description | Example |
|-------|-------------|---------|
| finacle_ref | Unique transaction reference | FIN-NIP-20260701-0042 |
| channel | Payment channel code | NIP |
| transaction_date | ISO datetime | 2026-07-01T14:30:00Z |
| amount | Numeric amount | 7500000.00 |
| currency | ISO 4217 | NGN |
| sender_name | Originator full name | Adebayo Okonkwo |
| sender_account | 10-digit account | 0123456789 |
| receiver_name | Beneficiary full name | Chioma Eze |
| receiver_account | 10-digit account | 9876543210 |
| branch_code | Branch identifier | 014 |
| narration | Transaction description | Business transfer |

---

## 13. Blockers & Risks

### 13.1 Active blockers

| Blocker | Impact | Affected milestone | Mitigation |
|---------|--------|-------------------|------------|
| **VPN access maxed out** | Cannot connect to Finacle DB remotely | M1, M2 | On-site visit; sample data export; VPN slot rotation |
| **No Finacle schema docs** | Cannot build Oracle extractor | M1 | Request docs + on-site schema discovery |
| **No NFIU format spec** | Reports not filing-ready | M1 | Request goAML XSD from compliance team |
| **GitHub push auth mismatch** | Code not on remote repo | DevOps | Log in to correct GitHub account (Divine-mercyx) |

### 13.2 Risk register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Finacle schema differs from assumptions | High | Medium | Schema discovery before coding extract queries |
| NFIU changes reporting format | Medium | High | Design report generator to be template-driven |
| Sanctions vendor licensing delays M2 | Medium | High | Early buy/build decision (D-07) |
| BVN watchlist access slow (CBN process) | High | Medium | Phase M2 without BVN initially |
| PEP detection too naive (keyword-only) | High | Medium | Integrate proper PEP registry (D-08) |
| OTP via console unacceptable in prod | Certain | High | Implement email/SMS (D-11) before go-live |
| No UAT data with known flags | Medium | Medium | Compliance prepares flagged test parties (D-15) |

---

## 14. Implementation Roadmap & Phases

### Phase 0 — Foundation (COMPLETE)

- [x] Project scaffolding (backend + frontend repos)
- [x] PostgreSQL staging warehouse
- [x] Authentication (password + OTP + JWT)
- [x] Team management
- [x] M1 UI pages (all)
- [x] M2 UI pages (all)
- [x] Mock ETL pipeline
- [x] Mock screening engine
- [x] Generic report generation
- [x] Audit logging

### Phase 1 — Real data integration (BLOCKED — waiting on Nova)

- [ ] Receive Finacle schema documentation (D-02)
- [ ] Receive sample transaction export (D-03)
- [ ] VPN access OR on-site schema discovery (D-01, D-06)
- [ ] Implement Oracle Finacle extractor
- [ ] Validate field mapping with compliance team
- [ ] File-based import fallback (interim)

### Phase 2 — Regulatory accuracy (M1)

- [ ] Receive NFIU format spec (D-04)
- [ ] Implement goAML-compliant XML for CTR/FTR
- [ ] Implement STR format (goAML 3.1+)
- [ ] Compliance team validates sample outputs
- [ ] Role-based permission hardening across all endpoints

### Phase 3 — Screening integration (M2)

- [ ] Sanctions API decision (D-07)
- [ ] Connect watchlist data sources (D-08)
- [ ] Internal watchlist migration (D-10)
- [ ] Finacle webhook integration (D-12)
- [ ] BVN watchlist (D-09) — may be later sub-phase

### Phase 4 — Production readiness (Both)

- [ ] Email/SMS OTP (D-11)
- [ ] Production hosting + SSL (D-16)
- [ ] NFIU sandbox testing (D-13, D-14)
- [ ] UAT with compliance team (D-15)
- [ ] Performance and security testing
- [ ] Regulatory sign-off (D-17)
- [ ] Go-live

---

## 15. Completion Estimates

### 15.1 By workstream

| Workstream | Demo (mock/csv) | Production |
|------------|-----------------|------------|
| M1 — ETL & staging | 95% | 45% (Oracle UAT + DBA confirm) |
| M1 — Reporting engine | 85% (generic XML, STR added) | 35% (needs goAML) |
| M1 — Workflow & audit | 90% | 78% |
| M2 — Screening UI & workflow | 88% | 42% |
| M2 — Live screening integration | 35% (partner API + simulate) | 15% |
| M4 — Partner integration APIs | 90% | 70% (needs prod keys/hosting) |
| Auth & team | 92% | 62% (needs prod OTP) |
| **Overall** | **~90–92%** | **~48–52%** |

### 15.2 What "100% production" means

**M1 production-ready when:**
- Live Finacle extract running on schedule
- Reports pass NFIU XSD validation
- Successful test submission in NFIU sandbox
- Compliance sign-off on 30-day parallel run

**M2 production-ready when:**
- Live Finacle events screened in < 50ms p95
- All required watchlists connected
- False positive rate within agreed SLA
- 30-day pilot with compliance team sign-off

---

## 16. UAT & Go-Live Criteria

### 16.1 M1 UAT test cases

| # | Test case | Expected result |
|---|-----------|-----------------|
| 1 | Run extraction for all channels | Records appear in staging with correct counts |
| 2 | Invalid account number in source | Flagged invalid with clear error message |
| 3 | ₦6M cash deposit | CTR flag set |
| 4 | $15K SWIFT transfer | FTR flag set |
| 5 | PEP name in transaction | PEP flag set |
| 6 | Generate CTR for month | XML + CSV produced with correct record count |
| 7 | Approver rejects report | Status = REJECTED, audit logged |
| 8 | Approver submits report | Status = SUBMITTED, audit logged |
| 9 | Viewer attempts extraction | Denied (once role enforcement complete) |
| 10 | Admin removes staff | User deactivated, cannot log in |

### 16.2 M2 UAT test cases

| # | Test case | Expected result |
|---|-----------|-----------------|
| 1 | Live transaction hits sanctions list | PENDING alert created < 50ms |
| 2 | Analyst approves alert (false positive) | Status = APPROVED, audit logged |
| 3 | Analyst escalates alert | Status = ESCALATED, audit logged |
| 4 | Performance dashboard | Latency and counts accurate |
| 5 | No match transaction | No alert created |

### 16.3 Go-live checklist

- [ ] Production credentials rotated (no dev passwords)
- [ ] OTP via email/SMS operational
- [ ] HTTPS enforced
- [ ] Database backups configured
- [ ] Finacle connection read-only verified
- [ ] NFIU sandbox submission successful
- [ ] MLRO written sign-off obtained
- [ ] Rollback plan documented
- [ ] Support contacts defined

---

## 17. Glossary

| Term | Definition |
|------|------------|
| **AML** | Anti-Money Laundering |
| **CTF** | Counter-Terrorist Financing |
| **CTR** | Cash Transaction Report — filed for large NGN transactions |
| **FTR** | Foreign Transaction Report — filed for foreign currency transactions above threshold |
| **PEP** | Politically Exposed Person — individuals with prominent public roles requiring enhanced due diligence |
| **STR** | Suspicious Transaction Report — filed when activity appears suspicious |
| **NFIU** | Nigerian Financial Intelligence Unit — receives regulatory reports |
| **goAML** | Anti-Money Laundering software standard used by NFIU for report formats |
| **Finacle** | Infosys core banking system used by Nova Bank |
| **Sidecar** | Companion application that extends Finacle without modifying core banking |
| **ETL** | Extract, Transform, Load — data pipeline pattern |
| **Staging warehouse** | Intermediate PostgreSQL database holding cleansed transactions before reporting |
| **MLRO** | Money Laundering Reporting Officer |
| **BVN** | Bank Verification Number — Nigerian national banking identity |
| **OFAC** | US Office of Foreign Assets Control sanctions list |
| **OTP** | One-Time Password — second factor at login |
| **UAT** | User Acceptance Testing |

---

## Appendix A — API Endpoint Summary

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/login` | Email + password → OTP session |
| POST | `/api/v1/auth/verify-otp` | OTP → JWT token |
| GET | `/api/v1/auth/me` | Current user profile |
| POST | `/api/v1/auth/staff` | Create staff (admin) |
| PATCH | `/api/v1/auth/staff/{id}` | Update staff (admin) |
| DELETE | `/api/v1/auth/staff/{id}` | Remove staff (admin) |

### Milestone 1 — Compliance
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/dashboard` | M1 dashboard stats |
| POST | `/api/v1/etl/run` | Run extraction |
| GET | `/api/v1/etl/runs` | List extraction runs |
| GET | `/api/v1/etl/runs/{id}/logs` | Run logs |
| GET | `/api/v1/staging/transactions` | Staged transactions |
| GET | `/api/v1/analytics/quality` | Data quality metrics |
| POST | `/api/v1/reports/generate` | Generate report |
| GET | `/api/v1/reports` | List reports |
| POST | `/api/v1/reports/{id}/approve` | Approve report |
| POST | `/api/v1/reports/{id}/reject` | Reject report |
| POST | `/api/v1/reports/{id}/submit` | Submit report |
| GET | `/api/v1/audit` | Audit trail |
| GET | `/api/v1/users` | List users |

### Milestone 2 — Screening
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/screening/dashboard` | Screening stats |
| GET | `/api/v1/screening/performance` | Performance metrics |
| GET | `/api/v1/screening/alerts` | List alerts |
| POST | `/api/v1/screening/simulate` | Generate mock alerts |
| POST | `/api/v1/screening/alerts/{id}/approve` | Approve alert |
| POST | `/api/v1/screening/alerts/{id}/reject` | Reject alert |
| POST | `/api/v1/screening/alerts/{id}/escalate` | Escalate alert |
| GET | `/api/v1/screening/audit` | Screening audit log |

---

## Appendix B — Suggested Presentation Slide Outline

For AI slide generation, suggested deck structure:

1. **Title slide** — Nova Bank Compliance Portal
2. **Problem statement** — NFIU obligations + Finacle gap
3. **Solution overview** — Sidecar architecture diagram
4. **Milestone 1 summary** — Reporting pipeline
5. **M1 module deep dive** — 8 sub-modules with status icons
6. **M1 demo flow** — 7-step walkthrough
7. **Milestone 2 summary** — Real-time screening
8. **M2 module deep dive** — 4 sub-modules with status icons
9. **M2 demo flow** — 6-step walkthrough
10. **Roles & permissions** — 4 roles matrix
11. **What's built today** — 75–80% demo complete
12. **What's not built** — Finacle, NFIU, sanctions, prod OTP
13. **Dependencies from Nova** — 17-item table (highlight IMMEDIATE)
14. **Active blockers** — VPN, schema, NFIU spec
15. **Mitigation plan** — On-site visit, sample data, file drops
16. **Roadmap** — Phases 0–4 timeline
17. **Completion estimates** — Demo vs production %
18. **UAT criteria** — M1 + M2 test cases
19. **Ask / next steps** — What Nova needs to deliver this week
20. **Q&A**

---

*End of document.*
