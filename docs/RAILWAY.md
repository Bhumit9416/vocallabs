# Railway deployment (step-by-step)

Deploy **4 services** from GitHub: Postgres → Hasura → Functions → Auth. Then wire Vercel to Railway URLs.

**Repo:** https://github.com/Bhumit9416/vocallabs

---

## Step 1 — Create Railway project

1. Go to [railway.app](https://railway.app) → **New Project**
2. **Deploy from GitHub repo** → select `Bhumit9416/vocallabs`
3. Railway creates one service — we'll add more.

---

## Step 2 — Add PostgreSQL

1. In project → **+ New** → **Database** → **PostgreSQL**
2. Wait until healthy.
3. Copy **`DATABASE_URL`** from Postgres → **Variables** (Connect tab).

---

## Step 3 — Hasura service

1. **+ New** → **GitHub Repo** → same repo (or duplicate existing service)
2. Rename service to **`hasura`**
3. **Settings** → **Root Directory**: leave empty (repo root)
4. **Settings** → **Build**:
   - Builder: **Dockerfile**
   - Dockerfile path: `deploy/hasura/Dockerfile`
5. **Settings** → **Networking** → **Generate Domain** → copy URL  
   Example: `https://hasura-production-abcd.up.railway.app`

6. **Variables** (replace secrets with your own):

```env
HASURA_GRAPHQL_DATABASE_URL=${{Postgres.DATABASE_URL}}
HASURA_GRAPHQL_ADMIN_SECRET=change-me-strong-admin-secret
HASURA_GRAPHQL_JWT_SECRET={"type":"HS256","key":"change-me-jwt-key-at-least-32-characters-long!!"}
HASURA_GRAPHQL_ENABLE_CONSOLE=true
HASURA_GRAPHQL_UNAUTHORIZED_ROLE=public
NHOST_WEBHOOK_SECRET=railway-webhook-secret-change-me
HASURA_GRAPHQL_SERVER_PORT=8080
PORT=8080
```

7. Deploy and wait for **Active**.

---

## Step 4 — Functions service

1. **+ New** → **GitHub Repo** → same repo
2. Rename to **`functions`**
3. **Settings** → **Root Directory**: `functions`
4. Builder: **Dockerfile** (uses `functions/Dockerfile`)
5. **Generate Domain** → copy URL  
   Example: `https://functions-production-efgh.up.railway.app`

6. **Variables**:

```env
PORT=4001
HASURA_GRAPHQL_URL=https://YOUR-HASURA-DOMAIN.up.railway.app/v1/graphql
HASURA_GRAPHQL_ADMIN_SECRET=change-me-strong-admin-secret
GROQ_API_KEY=your-groq-key
NHOST_WEBHOOK_SECRET=railway-webhook-secret-change-me
```

Use the **same** admin secret and webhook secret as Hasura.

7. Deploy.

---

## Step 5 — Auth service

1. **+ New** → **GitHub Repo** → same repo
2. Rename to **`auth`**
3. **Root Directory**: `services/auth-stub`
4. **Generate Domain** → copy URL  
   Example: `https://auth-production-ijkl.up.railway.app`

5. **Variables**:

```env
PORT=4002
JWT_SECRET=change-me-jwt-key-at-least-32-characters-long!!
HASURA_GRAPHQL_URL=https://YOUR-HASURA-DOMAIN.up.railway.app/v1/graphql
HASURA_GRAPHQL_ADMIN_SECRET=change-me-strong-admin-secret
```

`JWT_SECRET` must match the `key` inside Hasura's `HASURA_GRAPHQL_JWT_SECRET` JSON.

6. Deploy.

---

## Step 6 — Apply schema + metadata (from your laptop)

Create `.env.railway` locally (**do not commit**):

```env
DATABASE_URL=postgresql://...from-railway-postgres...
HASURA_GRAPHQL_URL=https://YOUR-HASURA.up.railway.app
HASURA_GRAPHQL_ADMIN_SECRET=change-me-strong-admin-secret
FUNCTIONS_FROM_HASURA=https://YOUR-FUNCTIONS.up.railway.app
AUTH_URL=https://YOUR-AUTH.up.railway.app
```

Run:

```powershell
cd c:\Users\HP\Downloads\vocallabs
npm install pg
node scripts/migrate.js
node scripts/bootstrap.js
```

Or use the helper:

```powershell
npm run railway:setup
```

(with env vars loaded from `.env.railway`)

---

## Step 7 — Point Vercel at Railway

[Vercel project settings → Environment Variables](https://vercel.com/medfolios-projects/vocallabs/settings/environment-variables):

```env
NEXT_PUBLIC_GRAPHQL_URL=https://YOUR-HASURA.up.railway.app/v1/graphql
NEXT_PUBLIC_GRAPHQL_WS_URL=wss://YOUR-HASURA.up.railway.app/v1/graphql
NEXT_PUBLIC_AUTH_URL=https://YOUR-AUTH.up.railway.app
NEXT_PUBLIC_AUTH_MODE=local
```

Redeploy:

```powershell
npx vercel deploy --prod
```

**Live app:** https://vocallabs-wine.vercel.app

---

## Step 8 — Test webhooks

See **[docs/WEBHOOKS.md](WEBHOOKS.md)** for full reference.

Quick test:

```powershell
npm run test:webhook
```

Or sign in on the hosted app → open workflow → **Start via webhook**.

---

## Service map

```
Browser (Vercel)
    → Auth (Railway)           signin/signup JWT
    → Hasura (Railway)         GraphQL + Actions + Events + Cron
         → Functions (Railway)  executor, webhooks, notify
         → Postgres (Railway)     data
```

---

## Costs

Railway free tier / trial credits are enough for assignment demo. Tear down services after review if needed.
