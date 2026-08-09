# VocalLabs — design notes

## Schema

Organizations own members, workflows, runs, and usage. Workflows hold ordered steps and triggers. Each execution creates one `workflow_runs` row and per-step `step_runs` rows. A `paused` status on both run and step_run models approval gates. `org_usage_stats` is a Postgres view aggregating monthly runs and average duration alongside quota counters on `organizations`.

Restricted side effects land in first-class tables: `workflow_results` for `db_write`, `notify_events` for `notify` (Hasura Event Trigger), and `watched_events` for database-event starts.

## Permission layers

**Layer 1 — Hasura org + role scoping.** Every select/insert/update/delete rule joins through `org_members` and `X-Hasura-User-Id`. Role alone is never enough: an editor in Org A cannot read Org B rows even with a guessed UUID. Owners manage membership and destructive workflow deletes; editors create/edit workflows and may trigger runs; viewers are read-only and cannot call `triggerWorkflowRun` successfully.

**Layer 2 — step-level gating outside simple row CRUD.** Creating `db_write` / `notify` steps or `webhook` triggers is blocked for non-owners via Postgres triggers that read the Hasura session user when present, and the UI mirrors the same rule. Clearing an `approval_gate` is intentionally not a raw table update from the client: the `approveStep` Action loads the step run, verifies the caller is an owner/editor in that workflow’s org, then marks the step approved and resumes execution. Quota checks and run orchestration live in the same Action handlers so mid-run decisions cannot be spoofed with a direct GraphQL update.

## Pause / resume

1. Executor reaches `approval_gate`, sets `step_runs.status = paused` and `workflow_runs.status = paused`, then returns.
2. Frontend subscription on `step_runs` for the run id surfaces the paused state without refresh.
3. `approveStep` validates membership role, writes `approved_by` / `approved_at`, completes the gate step, and continues from the next position — including retries on later `llm_call` / `http_request` failures and quota increment on successful completion.
