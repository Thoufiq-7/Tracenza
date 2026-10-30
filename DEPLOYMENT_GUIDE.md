# Tracenza — Cloud Hosting & Deployment Guide

This guide provides step-by-step instructions for hosting **Tracenza (PS 26262)** on **Render (Backend API)** and **Vercel (Frontend UI)** using their generous free tiers.

---

## Architecture Overview

```
[ User Browser ]
       │
       ▼
[ Vercel CDN (Frontend SPA) ]  ─── HTTPS ───► [ Render Web Service (FastAPI Backend) ]
 (https://tracenza.vercel.app)                   (https://tracenza-api.onrender.com)
                                                          │
                                                          ├──► PostgreSQL / SQLite
                                                          └──► Local Vault Storage
```

---

## Step 1: Push Code to GitHub

Make sure your latest local changes are committed and pushed to your GitHub repository:

```bash
git add .
git commit -m "feat: complete Tracenza refactor and deployment config"
git push origin main
```

---

## Step 2: Deploy Backend on Render

### Option A: 1-Click Blueprint (Recommended)
1. Go to [Render Dashboard](https://dashboard.render.com).
2. Click **New +** (top right) $\rightarrow$ **Blueprint**.
3. Connect your GitHub repository (`Tracenza`).
4. Render automatically reads [`render.yaml`](./render.yaml) and provisions:
   - **`tracenza-db`**: Managed PostgreSQL Database.
   - **`tracenza-api`**: FastAPI Web Service running the lightweight [`backend/Dockerfile`](./backend/Dockerfile).
5. Click **Apply**.
6. Once deployed, copy your backend URL (e.g., `https://tracenza-api.onrender.com`).

### Option B: Manual Web Service Deployment
1. In Render Dashboard, click **New +** $\rightarrow$ **Web Service**.
2. Connect your GitHub repository.
3. Configure the following fields:
   - **Name**: `tracenza-api`
   - **Region**: Singapore (or nearest to India)
   - **Root Directory**: Leave blank (or `backend`)
   - **Runtime**: **Docker**
   - **Dockerfile Path**: `./backend/Dockerfile`
   - **Docker Context**: `./backend`
   - **Instance Type**: **Free**
4. Under **Environment Variables**, add:
   | Key | Value | Description |
   |---|---|---|
   | `ENVIRONMENT` | `demo` | Seeds demo accounts and initial applications |
   | `SECRET_KEY` | *(Click 'Generate')* | 64-character JWT secret key |
   | `USE_MINIO` | `false` | Uses local storage vault |
   | `USE_CELERY` | `false` | Uses FastAPI async background tasks |
   | `CORS_ORIGINS` | `https://*.vercel.app,http://localhost:3000` | Allowed frontend origins |
   | `DATABASE_URL` | `sqlite:///./validex.db` | Local SQLite or Render PostgreSQL URL |
5. Click **Create Web Service**.
6. Note the public URL (e.g. `https://tracenza-api.onrender.com`).
7. Verify by opening `https://tracenza-api.onrender.com/health` in your browser.

---

## Step 3: Deploy Frontend on Vercel

1. Go to [Vercel Dashboard](https://vercel.com).
2. Click **Add New...** $\rightarrow$ **Project**.
3. Import your GitHub repository (`Tracenza`).
4. In the Project Configuration:
   - **Framework Preset**: `Vite`
   - **Root Directory**: Click **Edit** and select **`frontend`** *(Critical!)*
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. Expand **Environment Variables** and add:
   | Variable Name | Value | Description |
   |---|---|---|
   | `VITE_API_URL` | `https://tracenza-api.onrender.com` | Your Render backend URL from Step 2 |
6. Click **Deploy**.
7. Vercel will build and assign your domain (e.g. `https://tracenza.vercel.app`).

---

## Step 4: Link Frontend Domain in Backend CORS

Once your Vercel URL is generated:
1. Go to your **Render Web Service** $\rightarrow$ **Environment Variables**.
2. Update `CORS_ORIGINS` to include your exact Vercel domain:
   ```
   https://<your-app>.vercel.app,http://localhost:3000
   ```
3. Save changes (Render will automatically redeploy).

---

## Step 5: Verify Live Deployment

1. Open your Vercel URL in a browser.
2. Sign in with any of the demo accounts:
   - **Admin / Bureau Head**: `admin@aicte-india.org` / `admin123`
   - **Scrutiny Officer**: `scrutiny@aicte-india.org` / `scrutiny123`
   - **EVC Expert Inspector**: `expert@aicte-india.org` / `expert123`
   - **Institution Portal**: `principal@apex.edu.in` / `apex123`
3. Verify:
   - **Dashboard**: Live KPI metrics (Pending Scrutiny, EVC Pending, Overdue Obligations).
   - **Applications Triage**: RAG compliance badges, Dependency Radar, and Committee Stage Routing.
   - **Audit Ledger**: 1-click cryptographic hash chain verification.
   - **Blind Portal**: Upload receipts and encrypted clarification inbox.

