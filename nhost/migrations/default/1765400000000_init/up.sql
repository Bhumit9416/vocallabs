-- AI Agent Workflow Builder schema

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE member_role AS ENUM ('owner', 'editor', 'viewer');
CREATE TYPE step_type AS ENUM (
  'llm_call',
  'http_request',
  'db_write',
  'notify',
  'conditional_branch',
  'approval_gate'
);
CREATE TYPE trigger_type AS ENUM (
  'manual',
  'webhook',
  'scheduled',
  'database_event'
);
CREATE TYPE run_status AS ENUM (
  'pending',
  'running',
  'paused',
  'completed',
  'failed',
  'cancelled'
);
CREATE TYPE step_run_status AS ENUM (
  'pending',
  'running',
  'paused',
  'completed',
  'failed',
  'skipped'
);

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  quota_limit integer NOT NULL DEFAULT 100,
  quota_used integer NOT NULL DEFAULT 0,
  quota_period_start timestamptz NOT NULL DEFAULT date_trunc('month', now()),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE org_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role member_role NOT NULL DEFAULT 'viewer',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);

CREATE INDEX org_members_user_id_idx ON org_members(user_id);
CREATE INDEX org_members_org_id_idx ON org_members(org_id);

CREATE TABLE workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX workflows_org_id_idx ON workflows(org_id);

CREATE TABLE workflow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  position integer NOT NULL,
  type step_type NOT NULL,
  name text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workflow_id, position)
);

CREATE INDEX workflow_steps_workflow_id_idx ON workflow_steps(workflow_id);

CREATE TABLE workflow_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  type trigger_type NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  secret text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workflow_id, type)
);

CREATE INDEX workflow_triggers_workflow_id_idx ON workflow_triggers(workflow_id);

CREATE TABLE workflow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status run_status NOT NULL DEFAULT 'pending',
  trigger_type trigger_type NOT NULL DEFAULT 'manual',
  triggered_by uuid,
  current_step_position integer,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX workflow_runs_workflow_id_idx ON workflow_runs(workflow_id);
CREATE INDEX workflow_runs_org_id_idx ON workflow_runs(org_id);

CREATE TABLE step_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_run_id uuid NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  workflow_step_id uuid NOT NULL REFERENCES workflow_steps(id) ON DELETE CASCADE,
  position integer NOT NULL,
  status step_run_status NOT NULL DEFAULT 'pending',
  input jsonb,
  output jsonb,
  error text,
  attempt_count integer NOT NULL DEFAULT 0,
  approved_by uuid,
  approved_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX step_runs_workflow_run_id_idx ON step_runs(workflow_run_id);

-- Watched table for database_event triggers
CREATE TABLE watched_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX watched_events_org_id_idx ON watched_events(org_id);

-- Results table for db_write steps
CREATE TABLE workflow_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workflow_run_id uuid REFERENCES workflow_runs(id) ON DELETE SET NULL,
  key text NOT NULL,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX workflow_results_org_id_idx ON workflow_results(org_id);

-- Aggregation view: org usage this month + avg run duration
CREATE OR REPLACE VIEW org_usage_stats AS
SELECT
  o.id AS org_id,
  o.name AS org_name,
  o.quota_limit,
  o.quota_used,
  o.quota_period_start,
  COUNT(wr.id) FILTER (
    WHERE wr.created_at >= date_trunc('month', now())
  ) AS runs_this_month,
  AVG(
    EXTRACT(EPOCH FROM (wr.completed_at - wr.started_at))
  ) FILTER (
    WHERE wr.completed_at IS NOT NULL AND wr.started_at IS NOT NULL
      AND wr.created_at >= date_trunc('month', now())
  ) AS avg_run_duration_seconds
FROM organizations o
LEFT JOIN workflow_runs wr ON wr.org_id = o.id
GROUP BY o.id, o.name, o.quota_limit, o.quota_used, o.quota_period_start;

-- Helper: check membership role for a user in an org
CREATE OR REPLACE FUNCTION public.user_org_role(p_org_id uuid, p_user_id uuid)
RETURNS member_role
LANGUAGE sql
STABLE
AS $$
  SELECT role FROM org_members
  WHERE org_id = p_org_id AND user_id = p_user_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_org_member(p_org_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = p_org_id AND user_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(p_org_id uuid, p_user_id uuid, p_roles member_role[])
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = p_org_id
      AND user_id = p_user_id
      AND role = ANY (p_roles)
  );
$$;

-- Reset quota period if month rolled over
CREATE OR REPLACE FUNCTION public.ensure_quota_period(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE organizations
  SET quota_used = 0,
      quota_period_start = date_trunc('month', now()),
      updated_at = now()
  WHERE id = p_org_id
    AND quota_period_start < date_trunc('month', now());
END;
$$;

-- Enforce Layer 2: only owners may insert restricted step types / webhook triggers
CREATE OR REPLACE FUNCTION public.enforce_step_type_permissions()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_org_id uuid;
  v_user_id uuid;
  v_role member_role;
BEGIN
  v_user_id := NULLIF(current_setting('hasura.user', true), '')::jsonb ->> 'x-hasura-user-id';
  IF v_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT org_id INTO v_org_id FROM workflows WHERE id = NEW.workflow_id;
  v_role := public.user_org_role(v_org_id, v_user_id::uuid);

  IF NEW.type IN ('db_write', 'notify') AND (v_role IS NULL OR v_role <> 'owner') THEN
    RAISE EXCEPTION 'Only org owners can add % steps', NEW.type;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_step_type_permissions
  BEFORE INSERT OR UPDATE OF type ON workflow_steps
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_step_type_permissions();

CREATE OR REPLACE FUNCTION public.enforce_trigger_type_permissions()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_org_id uuid;
  v_user_id uuid;
  v_role member_role;
BEGIN
  v_user_id := NULLIF(current_setting('hasura.user', true), '')::jsonb ->> 'x-hasura-user-id';
  IF v_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT org_id INTO v_org_id FROM workflows WHERE id = NEW.workflow_id;
  v_role := public.user_org_role(v_org_id, v_user_id::uuid);

  IF NEW.type = 'webhook' AND (v_role IS NULL OR v_role <> 'owner') THEN
    RAISE EXCEPTION 'Only org owners can add webhook triggers';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_trigger_type_permissions
  BEFORE INSERT OR UPDATE OF type ON workflow_triggers
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_trigger_type_permissions();

-- Notify event payload helper table marker (Event Trigger listens on notify_events)
CREATE TABLE notify_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workflow_run_id uuid REFERENCES workflow_runs(id) ON DELETE SET NULL,
  channel text NOT NULL DEFAULT 'slack',
  message text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
