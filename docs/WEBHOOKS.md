# Webhooks & triggers

All external URLs below use your **Railway public domains**. Replace placeholders after deploy.

| Service | Railway variable | Example |
|---------|------------------|---------|
| Hasura GraphQL | `HASURA_PUBLIC_URL` | `https://hasura-production-xxxx.up.railway.app` |
| Functions | `FUNCTIONS_PUBLIC_URL` | `https://functions-production-xxxx.up.railway.app` |

Run bootstrap after deploy (from your laptop):

```bash
HASURA_GRAPHQL_URL=https://YOUR-HASURA.up.railway.app \
HASURA_GRAPHQL_ADMIN_SECRET=your-admin-secret \
FUNCTIONS_FROM_HASURA=https://YOUR-FUNCTIONS.up.railway.app \
AUTH_URL=https://YOUR-AUTH.up.railway.app \
node scripts/migrate.js
node scripts/bootstrap.js
```

---

## 1. Inbound workflow webhook (`webhookTrigger` Action)

External systems start a workflow by calling the **Hasura GraphQL** endpoint (not the functions URL directly).

**Endpoint**

```
POST https://YOUR-HASURA.up.railway.app/v1/graphql
Content-Type: application/json
```

**Body**

```json
{
  "query": "mutation Webhook($workflow_id: uuid!, $secret: String!, $payload: jsonb) { webhookTrigger(workflow_id: $workflow_id, secret: $secret, payload: $payload) { run_id status message } }",
  "variables": {
    "workflow_id": "e35bff8a-fb05-4740-94a1-c4a8042742e0",
    "secret": "org-a-webhook-secret",
    "payload": { "lead": "Inbound from CRM", "source": "webhook" }
  }
}
```

- No auth header required (`public` role on this Action).
- Secret must match `workflow_triggers.secret` for that workflow’s webhook trigger.
- Handler: `FUNCTIONS_PUBLIC_URL/webhook-trigger` (wired by bootstrap).

**curl**

```bash
curl -X POST "https://YOUR-HASURA.up.railway.app/v1/graphql" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"mutation(\$w:uuid!,\$s:String!,\$p:jsonb){webhookTrigger(workflow_id:\$w,secret:\$s,payload:\$p){run_id status}}\",\"variables\":{\"w\":\"WORKFLOW_ID\",\"s\":\"org-a-webhook-secret\",\"p\":{\"lead\":\"test\"}}}"
```

**UI:** Workflow page → **Start via webhook** (same mutation from the browser).

---

## 2. Hasura Actions (authenticated)

| Action | Path | Who calls |
|--------|------|-----------|
| `triggerWorkflowRun` | `/trigger-workflow-run` | Logged-in owner/editor |
| `approveStep` | `/approve-step` | Logged-in owner/editor |
| `webhookTrigger` | `/webhook-trigger` | Public / external |

Actions are registered in Hasura metadata with handler `https://YOUR-FUNCTIONS.up.railway.app/<path>`.

**Manual run (JWT required)**

```graphql
mutation {
  triggerWorkflowRun(
    workflow_id: "WORKFLOW_ID"
    input: { lead: "Acme Corp" }
  ) {
    run_id
    status
    message
  }
}
```

Header: `Authorization: Bearer <accessToken from /signin>`

---

## 3. Event triggers (Hasura → Functions)

Hasura POSTs to your functions when rows are inserted.

| Event | Table | Handler |
|-------|-------|---------|
| Notify | `notify_events` | `POST /notify-handler` |
| DB workflow start | `watched_events` | `POST /db-event-trigger` |

Headers include `x-nhost-webhook-secret: local-webhook-secret` (set `NHOST_WEBHOOK_SECRET` on Hasura + functions to the same value in Railway).

**Test DB event trigger**

```graphql
mutation {
  insert_watched_events_one(
    object: {
      org_id: "ORG_A_ID"
      event_type: "lead_created"
      payload: { lead: "Event-driven lead" }
    }
  ) {
    id
  }
}
```

(Use owner/editor JWT — or run **Fire DB event** in the UI.)

---

## 4. Scheduled trigger (cron)

Hasura cron `scheduled_workflow_tick` calls:

```
POST https://YOUR-FUNCTIONS.up.railway.app/scheduled-trigger
```

Schedule: every 5 minutes (`*/5 * * * *`). Workflows with `scheduled` triggers and `config.every_minutes` or `config.cron: "every_5m"` will auto-start.

---

## 5. Notify (Slack)

When a `notify` step runs, a row is inserted into `notify_events` → Event Trigger → `/notify-handler`.

Set on **functions** service in Railway:

```
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/XXX/YYY/ZZZ
```

If unset, notify is logged (stub) — still satisfies the assignment.

---

## 6. Railway env checklist

### Postgres (plugin)
- Auto: `DATABASE_URL`

### Hasura
```
HASURA_GRAPHQL_DATABASE_URL=${{Postgres.DATABASE_URL}}
HASURA_GRAPHQL_ADMIN_SECRET=<strong-secret>
HASURA_GRAPHQL_JWT_SECRET={"type":"HS256","key":"<same-as-auth-JWT_SECRET>"}
HASURA_GRAPHQL_ENABLE_CONSOLE=true
HASURA_GRAPHQL_DEV_MODE=false
HASURA_GRAPHQL_UNAUTHORIZED_ROLE=public
NHOST_WEBHOOK_SECRET=<shared-webhook-secret>
```

### Functions
```
PORT=4001
HASURA_GRAPHQL_URL=https://YOUR-HASURA.up.railway.app/v1/graphql
HASURA_GRAPHQL_ADMIN_SECRET=<same-as-hasura>
GROQ_API_KEY=<your-key>
NHOST_WEBHOOK_SECRET=<same-as-hasura>
```

### Auth
```
PORT=4002
JWT_SECRET=<same-key-inside-jwt-secret-json>
HASURA_GRAPHQL_URL=https://YOUR-HASURA.up.railway.app/v1/graphql
HASURA_GRAPHQL_ADMIN_SECRET=<same-as-hasura>
```

### Vercel (frontend)
```
NEXT_PUBLIC_GRAPHQL_URL=https://YOUR-HASURA.up.railway.app/v1/graphql
NEXT_PUBLIC_GRAPHQL_WS_URL=wss://YOUR-HASURA.up.railway.app/v1/graphql
NEXT_PUBLIC_AUTH_URL=https://YOUR-AUTH.up.railway.app
NEXT_PUBLIC_AUTH_MODE=local
```

Then: `npx vercel deploy --prod`

---

## 7. Troubleshooting

| Problem | Fix |
|---------|-----|
| Action timeout | Functions URL must be **public** HTTPS; re-run bootstrap with correct `FUNCTIONS_FROM_HASURA` |
| Webhook 403 | Wrong `secret` for workflow |
| Event trigger silent | Check Hasura → Events → delivery logs; verify `NHOST_WEBHOOK_SECRET` matches |
| CORS / auth fail | Vercel env must point to Railway URLs, not localhost |
| Empty workflows after deploy | Run `node scripts/bootstrap.js seed` against production Hasura |
