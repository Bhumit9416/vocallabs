# Final Task — live demo script (~2 minutes)

Use this while screen-recording. Run locally or on hosted URL.

## Before recording

```bash
docker compose up -d
node scripts/bootstrap.js   # only if fresh DB
npm run dev                 # frontend at http://localhost:3000
```

Sign-in password for all demo users: `password123`

---

## Scene 1 — Org A owner builds / opens workflow (20s)

1. Open app → sign in as **owner.a@demo.local**
2. Dashboard shows **Org A** and quota indicator
3. Open **Lead Qualification Pipeline**
4. Point out steps: `llm_call`, `http_request`, `conditional_branch`, `approval_gate`, `notify`
5. Point out triggers: manual, webhook, database_event

---

## Scene 2 — Manual run + live subscription (40s)

1. Enter lead text: `Acme Corp — interested in enterprise plan`
2. Click **Run** (visible because user is owner)
3. **Do not refresh** — watch live step status update:
   - LLM completes (Groq: real `sentiment=positive/negative`)
   - HTTP step completes
   - Conditional branch runs
   - Run status shows **paused** on approval_gate
4. Click **Approve**
5. Remaining steps complete; quota increments in top bar

---

## Scene 3 — Second trigger: webhook (20s)

1. Click **Start via webhook**
2. New run starts without using Run button
3. Live status streams again

(Optional: click **Fire DB event** to show database_event trigger.)

---

## Scene 4 — Viewer cannot run (15s)

1. Sign out
2. Sign in as **viewer.a@demo.local**
3. Open same workflow — **Run** button is hidden / “Viewers cannot trigger runs”

---

## Scene 5 — Cross-org isolation (25s)

1. Sign out
2. Sign in as **owner.b@demo.local**
3. Dashboard shows **Org B only** — no Org A workflows
4. Paste Org A workflow URL directly in browser:
   ```
   /workflows/e35bff8a-fb05-4740-94a1-c4a8042742e0
   ```
   (or current id from `scripts/demo-seed.json`)
5. Page shows **Workflow not available** — isolation holds even with guessed ID

---

## Closing line

> “Two orgs, role-scoped permissions, step-level gating, live subscriptions, manual + webhook triggers, and approval pause/resume — all enforced in Hasura and Action handlers.”

---

## Automated backup check

```bash
npm run smoke
```

Should print `Smoke test OK`.
