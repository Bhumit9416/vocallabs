# Deployment guide

Deploy backend first, then frontend. The frontend must point at a **public** GraphQL URL (not localhost).

## Architecture

```
Vercel (Next.js)  →  Hasura GraphQL + WS  →  Postgres
                           ↓
                    Functions (Actions + event handlers)
                           ↓
                    Auth (local stub or nhost Auth)
```

---

## Option A — Local demo + GitHub (fastest for review)

Reviewers clone repo and run:

```bash
docker compose up -d --build
node scripts/bootstrap.js
npm install && npm run dev
```

Submit GitHub link + note in README: “Hosted URL: run locally per README (5 min setup).”

Some reviewers accept this if README is clear; assignment asks for hosted URL — prefer Option B or C.

---

## Option B — Railway (full Docker stack)

1. Create account at [railway.app](https://railway.app)
2. **New Project → Deploy from GitHub** → select `Bhumit9416/vocallabs`
3. Add **PostgreSQL** plugin
4. Deploy services from `docker-compose.yml` or split:
   - Hasura service (port 8080, public domain)
   - Functions service (port 4001, internal + public for Actions)
   - Auth-stub (port 4002, public domain)
5. Set environment variables on **functions** service:
   - `GROQ_API_KEY`
   - `HASURA_GRAPHQL_URL` = internal Hasura URL
   - `HASURA_GRAPHQL_ADMIN_SECRET`
6. Run bootstrap once against public Hasura:
   ```bash
   HASURA_GRAPHQL_URL=https://YOUR-HASURA.up.railway.app/v1/graphql \
   FUNCTIONS_FROM_HASURA=https://YOUR-FUNCTIONS.up.railway.app \
   AUTH_URL=https://YOUR-AUTH.up.railway.app \
   node scripts/bootstrap.js
   ```
7. Note public URLs for Vercel env vars below.

---

## Option C — nhost cloud (matches assignment stack)

1. [app.nhost.io](https://app.nhost.io) → New project → connect GitHub repo
2. Copy `nhost/migrations` and `nhost/metadata` into project (already in repo)
3. Deploy functions from `/functions` as nhost serverless functions
4. Set secrets: `GROQ_API_KEY`, webhook secrets
5. Apply migrations + metadata via nhost CLI or dashboard
6. Update frontend to use `@nhost/nextjs` with your subdomain (see nhost docs)

---

## Vercel — frontend

### 1. Install CLI

```bash
npm i -g vercel
vercel login
```

### 2. Deploy from project root

```bash
vercel
```

### 3. Environment variables (Vercel dashboard → Settings → Environment Variables)

| Variable | Example |
|----------|---------|
| `NEXT_PUBLIC_GRAPHQL_URL` | `https://your-hasura.app/v1/graphql` |
| `NEXT_PUBLIC_GRAPHQL_WS_URL` | `wss://your-hasura.app/v1/graphql` |
| `NEXT_PUBLIC_AUTH_URL` | `https://your-auth.app` |
| `NEXT_PUBLIC_AUTH_MODE` | `local` |

**Do not** add `GROQ_API_KEY` to Vercel — it belongs on the **functions** service only.

### 4. Redeploy after env vars

```bash
vercel --prod
```

---

## Post-deploy checklist

- [ ] Sign in works on hosted URL
- [ ] `npm run smoke` passes against hosted Hasura (update env URLs)
- [ ] WebSocket subscription shows live step updates
- [ ] Org B cannot see Org A data
- [ ] Update README with live app URL

---

## Secrets reminder

- Never commit `.env` or `.env.local`
- Rotate Groq key if it was ever shared in chat or logs
- Use platform secret managers only
