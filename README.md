# VocalLabs

Mini workflow builder for chaining AI agent steps. Built on Hasura GraphQL, PostgreSQL, and a Next.js app. Local stack uses Docker (Postgres + Hasura + Action handlers + auth). The same Hasura metadata/migrations under `nhost/` work with an nhost project if you prefer cloud hosting.

## Submission

| Deliverable | Link |
|-------------|------|
| **GitHub repo** | https://github.com/Bhumit9416/vocallabs |
| **Live app** | https://vocallabs-wine.vercel.app |
| **Demo recording** | _Record using [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md)_ |
| **Architecture write-up** | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |

Quick verify after setup: `npm run smoke`

## What you get

- Org-scoped workflows with ordered steps: `llm_call`, `http_request`, `db_write`, `notify`, `conditional_branch`, `approval_gate`
- Triggers: manual, webhook (Hasura Action), scheduled (cron), database event (Event Trigger)
- Two permission layers: Hasura org/role rules + Action/DB enforcement for sensitive steps and approvals
- Live `step_runs` subscription (including paused / awaiting approval)
- Quota tracking with monthly usage aggregation view

## Quick start (local)

### Prerequisites

- Docker Desktop
- Node.js 18+ (20+ recommended)

### 1. Environment

```bash
cp .env.example .env.local
```

Optional free-tier keys in `.env` / shell before `docker compose up`:

- `GROQ_API_KEY` — real LLM calls (recommended free tier)
- `SLACK_WEBHOOK_URL` — real Slack notify delivery

If `GROQ_API_KEY` is unset, `llm_call` uses a disclosed stub response with an artificial ~800ms delay.

### 2. Start backend

```bash
docker compose up -d --build
```

Services:

| Service   | URL                         |
|-----------|-----------------------------|
| Hasura    | http://localhost:8080       |
| Functions | http://localhost:4001       |
| Auth      | http://localhost:4002       |
| Postgres  | localhost:5432              |

Admin secret: `local-admin-secret`

### 3. Apply metadata + seed demo orgs

```bash
node scripts/bootstrap.js
```

This tracks tables, relationships, permissions, Actions, event/cron triggers, and seeds the Final Task scenario.

Demo users (password `password123`):

| Email                 | Org   | Role   |
|-----------------------|-------|--------|
| owner.a@demo.local    | Org A | owner  |
| editor.a@demo.local   | Org A | editor |
| viewer.a@demo.local   | Org A | viewer |
| owner.b@demo.local    | Org B | owner  |

### 4. Frontend

```bash
npm install
npm run dev
```

Open http://localhost:3000 and sign in as `owner.a@demo.local`.

## Final Task walkthrough

1. Sign in as Org A owner. Open **Lead Qualification Pipeline**.
2. Confirm steps include `llm_call`, `http_request`, `conditional_branch`, plus approval.
3. Click **Run**. Watch live step status; run pauses on approval.
4. Click **Approve** (owner/editor only). Remaining steps finish; quota increments.
5. Click **Start via webhook** (or call `webhookTrigger` with secret `org-a-webhook-secret`).
6. Sign out, sign in as `owner.b@demo.local`. Org A workflows are invisible; opening an Org A workflow id shows “not available”; approve/trigger against Org A ids fails.

## GraphQL highlights

- Query org workflows with steps, triggers, latest run
- Mutations via Actions: `triggerWorkflowRun`, `approveStep`, `webhookTrigger`
- Subscription: `step_runs(where: { workflow_run_id: { _eq: $runId } })`

Hasura console: http://localhost:8080/console (admin secret above).

## Project layout

```
nhost/migrations   Postgres schema
nhost/metadata     Hasura metadata (permissions, relationships, Actions)
functions/         Action + event handlers (executor, retries, quota)
scripts/bootstrap.js  Local metadata apply + seed
src/               Next.js app
docs/ARCHITECTURE.md  Schema + permission write-up
docs/DEMO_SCRIPT.md   Screen recording script
docs/DEPLOY.md        Hosted deployment steps
```

## Deploy

See **[docs/RAILWAY.md](docs/RAILWAY.md)** for step-by-step backend deploy.

Webhook reference: **[docs/WEBHOOKS.md](docs/WEBHOOKS.md)**

Summary:

1. Deploy backend (Hasura + functions + auth) to Railway or nhost.
2. Run `node scripts/bootstrap.js` against the public Hasura URL.
3. Deploy Next.js to Vercel with `NEXT_PUBLIC_GRAPHQL_URL`, `NEXT_PUBLIC_GRAPHQL_WS_URL`, `NEXT_PUBLIC_AUTH_URL`.
4. Record demo using [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md).

## Notes

- Cross-org isolation is enforced in Hasura permissions; guessing UUIDs returns empty/denied.
- `db_write`, `notify`, and webhook trigger creation are owner-gated.
- Approval resume is enforced in the `approveStep` handler, not by trusting client updates alone.
