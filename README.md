# Tracenza — Integrated AICTE Approval Workflow, Compliance Monitoring & Alert Management System

**Smart India Hackathon 2026 · Problem Statement PS 26262 · Team We Aren't Robots**

Tracenza is an intelligent decision-support and compliance management platform engineered for the **All India Council for Technical Education (AICTE)**. It automates statutory norm verification against the **AICTE Approval Process Handbook (APH 2026-27)**, monitors time-sensitive institutional obligations, orchestrates committee approval pipelines, and maintains a cryptographically verifiable audit trail.

> **Core Philosophy**: *"Officers decide. Tracenza routes, reminds, flags, and records. It never approves or rejects."*

All AI models and rule checks are purely advisory. Formal approvals, deficiency notices, and stage progressions are executed exclusively by authorized officials with mandatory, tamper-evident audit justifications.

---

## Key Capabilities & Problem Statement Compliance

| Feature | Technical Architecture & Implementation |
|---|---|
| **Deterministic APH Rule Engine** | [`rule_engine.py`](backend/app/services/rule_engine.py): Strict **Decimal** arithmetic (no generative hallucination). Enforces UG Engineering 1:15/1:20 ratios, Cadre 1:2:6 ($\text{Professors} \ge \lceil \text{faculty} / 9 \rceil$), Classroom Carpet Area $\ge 66\text{ m}^2$ ($4.5\text{ m}^2/\text{student}$), and contiguous land bounds ($2.5$ to $7.5+$ acres). Outputs **Green/Amber/Red (RAG)** labels, calculation traces, and handbook citations (e.g., *APH Appx 7 Cl 7.1*, *Appx 4 Cl 4.1*). |
| **4-Stage Committee Approval Pipeline** | [`pipeline.py`](backend/app/services/pipeline.py): Orchestrates applications across the statutory lifecycle: `SCRUTINY` (document norm check) $\rightarrow$ `EVC` (on-site/virtual Expert Visiting Committee) $\rightarrow$ `SAC_SHC` (Standing Appeals/Hearing Committee) $\rightarrow$ `FINAL_REVIEW` (formal order issuance). Stage transitions require verified officer credentials and mandatory written justifications ($\ge 10$ chars). |
| **Uniform Obligation & Expiry Tracking** | [`obligation_service.py`](backend/app/services/obligation_service.py): Unifies time-sensitive compliance items: Registered Land Leases (30-year unencumbered norm), Fire Safety NOCs, University Affiliation Consent, EVC Inspection Readiness (48h/15-day SLA), and Mandatory Annual Undertakings. Features Celery Beat periodic sweeps with automated multi-channel alert queues (**Email**, **SMS**, **WhatsApp**). |
| **Dependency Radar Visualization** | `DependencyRadar.tsx` (`@xyflow/react`): Dynamic node-graph mapping an application node to active compliance blockers (Expired Leases, Shortfall Faculty, Missing Undertakings) with Red, Amber, and Green status rings. |
| **Tamper-Evident Audit Ledger** | [`audit_service.py`](backend/app/services/audit_service.py): Append-only, cryptographic hash-chained ledger ($\text{hash} = H(\text{previous\_hash} + \text{canonical payload})$) securing every upload, rule modification, officer review, and stage progression. 1-click ledger verification (`/api/audit/verify-chain`). |
| **Strict Blind Institution Portal** | Institutional views ([`portal.py`](backend/app/schemas/portal.py)) return static confirmation receipts (`"Document Received & Secured"`), strictly withholding internal RAG scores, risk numbers, and forensic indicators. Missing/expired items trigger end-to-end encrypted clarification requests (RSA-OAEP-2048 + AES-256-GCM). |
| **Infrastructure Verification & Spatial GIS** | Computer vision inspection ([`infrastructure_cv.py`](backend/app/ml/infrastructure_cv.py), YOLOv8 on ONNX Runtime) verifying computer labs and equipment counts; geodesic spatial survey ([`spatial_service.py`](backend/app/services/spatial_service.py)) checking campus boundaries and building footprints against sanctioned master plans. |

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            FRONTEND (React + Vite)                          │
│   Institution Blind Portal  ·  Scrutiny Dashboard  ·  Dependency Radar      │
│   Committee Stage Routing   ·  Rules Console       ·  Tamper-Evident Ledger │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ /api (JWT + RBAC)
┌──────────────────────────────────────▼──────────────────────────────────────┐
│                            BACKEND (FastAPI API)                            │
│  ┌───────────────────────┐  ┌─────────────────────┐  ┌────────────────────┐ │
│  │ APH Rule Engine       │  │ Pipeline Stages     │  │ Obligation Service │ │
│  │ (Exact Decimal Norms) │  │ (SCRUTINY/EVC/SAC)  │  │ (Email/SMS/WhatsApp│ │
│  └───────────────────────┘  └─────────────────────┘  └────────────────────┘ │
│  ┌───────────────────────┐  ┌─────────────────────┐  ┌────────────────────┐ │
│  │ Hash-Chained Audit    │  │ Custody & Forensics │  │ Spatial & YOLO CV  │ │
│  │ Ledger (SHA-256)      │  │ (Watermark + QR)    │  │ (ONNX Runtime)     │ │
│  └───────────────────────┘  └─────────────────────┘  └────────────────────┘ │
└──────────────────────┬──────────────────────────────────────┬───────────────┘
                       │                                      │
            ┌──────────▼──────────┐                ┌──────────▼──────────┐
            │ PostgreSQL / SQLite │                │ MinIO / Local Vault │
            │ (Ledger & Metadata) │                │ (Document Storage)  │
            └─────────────────────┘                └─────────────────────┘
```

---

## Cloud Hosting & Deployment Guide

Tracenza is ready for deployment on **Render** (Backend API + Database) and **Vercel** (Frontend UI) using their free tiers.

### 1. Backend Deployment on [Render](https://dashboard.render.com)

#### Option A: 1-Click Blueprint (Recommended)
1. Push this repository to your GitHub account.
2. Go to [Render Dashboard](https://dashboard.render.com) $\rightarrow$ **New +** $\rightarrow$ **Blueprint**.
3. Select your `Tracenza` repository.
4. Render automatically reads [`render.yaml`](render.yaml) and provisions:
   - **`tracenza-db`**: PostgreSQL database.
   - **`tracenza-api`**: FastAPI Web Service running [`backend/Dockerfile`](backend/Dockerfile).
5. Click **Apply**.
6. Once deployed, note your public API URL (e.g., `https://tracenza-api.onrender.com`).

#### Option B: Manual Web Service on Render
1. In Render Dashboard, click **New +** $\rightarrow$ **Web Service**.
2. Connect your GitHub repository.
3. Configure settings:
   - **Environment / Runtime**: `Docker`
   - **Dockerfile Path**: `./backend/Dockerfile`
   - **Docker Context**: `./backend`
   - **Plan**: `Free`
4. Add the following **Environment Variables**:
   | Variable | Value | Description |
   |---|---|---|
   | `ENVIRONMENT` | `demo` | Seeds demo accounts and synthetic data |
   | `SECRET_KEY` | *(Click "Generate")* | 64-char JWT secret |
   | `USE_MINIO` | `false` | Uses local storage vault |
   | `USE_CELERY` | `false` | Uses FastAPI background tasks |
   | `CORS_ORIGINS` | `https://*.vercel.app,http://localhost:3000` | Allowed client origins |
   | `DATABASE_URL` | `sqlite:///./validex.db` | Or Render PostgreSQL internal URL |
5. Click **Create Web Service**. Verify health at `https://your-api.onrender.com/health`.

---

### 2. Frontend Deployment on [Vercel](https://vercel.com)

1. Go to [Vercel Dashboard](https://vercel.com) $\rightarrow$ **Add New...** $\rightarrow$ **Project**.
2. Import your `Tracenza` repository.
3. In Project Settings:
   - **Framework Preset**: `Vite`
   - **Root Directory**: Select **`frontend`** *(or leave default `.` as the root `vercel.json` will auto-build `frontend`)*
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Under **Environment Variables**, add:
   - `VITE_API_URL`: `https://your-api.onrender.com` *(your Render backend URL)*
5. Click **Deploy**. Vercel will build and assign your live URL (e.g. `https://tracenza.vercel.app`).
6. **Instant UI Connect (Fallback)**: If you deployed without setting `VITE_API_URL`, the Tracenza sign-in page displays an on-screen connection prompt where you can paste your Render URL and connect immediately without waiting for a redeploy.

---

### 3. Docker Compose (Self-Hosted VPS / AWS EC2 / DigitalOcean)

To host the entire production stack (FastAPI, Nginx, PostgreSQL, MinIO, Redis, Celery) on a single server:

```bash
# Set production credentials
cp .env.production.example .env
nano .env

# Build and start all services
docker compose -f docker-compose.prod.yml up -d --build

# Seed initial baseline data
docker compose exec backend python ../scripts/generate_demo_data.py --reset
```

---

## Local Quick Start (Development)

### 1. Backend Setup (FastAPI)
```bash
cd backend
python -m venv .venv
# Windows:
.\.venv\Scripts\activate
# Linux/macOS:
source .venv/bin/activate

pip install -r requirements.txt
python ../scripts/generate_demo_data.py --reset
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

### 2. Frontend Setup (React + Vite)
```bash
cd frontend
npm install
npm run dev
```

- **Frontend App**: `http://localhost:3000`
- **Backend API & Swagger Docs**: `http://127.0.0.1:8000/docs`
- **API Health Check**: `http://127.0.0.1:8000/health`

---

## Verified Demo Accounts

| Role | Email | Password | Access Scope |
|---|---|---|---|
| **Admin / Bureau Head** | `admin@aicte-india.org` | `admin123` | Full ledger, rules configuration, governance |
| **Regional Scrutiny Officer** | `scrutiny@aicte-india.org` | `scrutiny123` | Triage queue, Dependency Radar, stage transitions |
| **EVC Expert Inspector** | `expert@aicte-india.org` | `expert123` | Infrastructure CV inspection, lab verification |
| **Apex Institute (Compliant)** | `principal@apex.edu.in` | `apex123` | Blind portal, receipt verification |
| **Zenith College (Deficient)** | `principal@zenith.edu.in` | `zenith123` | Deficiency notices, encrypted clarification inbox |
| **Crescent Institute** | `principal@crescent.edu.in` | `crescent123` | Compliance uploads, status tracking |

---

## Running the Automated Test Suite

```bash
cd backend
# Run all unit, integration, and APH norm tests
python -m pytest

# Run specifically the new Tracenza obligations and pipeline test suite:
python -m pytest tests/test_obligations_pipeline.py
```

All 52 test cases covering deterministic APH rule arithmetic, pipeline stage transitions, uniform obligation sweeps, and cryptographic ledger verification execute in $< 10$ seconds with 100% pass rate.
