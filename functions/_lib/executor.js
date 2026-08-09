const { gql, sleep } = require('./graphql');

const GET_WORKFLOW = `
  query GetWorkflow($id: uuid!) {
    workflows_by_pk(id: $id) {
      id
      org_id
      name
      is_active
      organization {
        id
        quota_limit
        quota_used
        quota_period_start
      }
      steps(order_by: { position: asc }) {
        id
        position
        type
        name
        config
      }
    }
  }
`;

const GET_MEMBERSHIP = `
  query GetMembership($org_id: uuid!, $user_id: uuid!) {
    org_members(where: { org_id: { _eq: $org_id }, user_id: { _eq: $user_id } }, limit: 1) {
      id
      role
    }
  }
`;

const CREATE_RUN = `
  mutation CreateRun($object: workflow_runs_insert_input!) {
    insert_workflow_runs_one(object: $object) {
      id
      status
    }
  }
`;

const CREATE_STEP_RUNS = `
  mutation CreateStepRuns($objects: [step_runs_insert_input!]!) {
    insert_step_runs(objects: $objects) {
      returning { id position workflow_step_id status }
    }
  }
`;

const UPDATE_RUN = `
  mutation UpdateRun($id: uuid!, $set: workflow_runs_set_input!) {
    update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: $set) {
      id
      status
    }
  }
`;

const UPDATE_STEP_RUN = `
  mutation UpdateStepRun($id: uuid!, $set: step_runs_set_input!) {
    update_step_runs_by_pk(pk_columns: { id: $id }, _set: $set) {
      id
      status
      position
    }
  }
`;

const GET_STEP_RUN = `
  query GetStepRun($id: uuid!) {
    step_runs_by_pk(id: $id) {
      id
      status
      position
      workflow_run_id
      workflow_step_id
      workflow_run {
        id
        org_id
        status
        context
        workflow_id
        workflow {
          steps(order_by: { position: asc }) {
            id
            position
            type
            name
            config
          }
        }
      }
      workflow_step {
        id
        type
        name
        config
      }
    }
  }
`;

const GET_STEP_RUNS = `
  query GetStepRuns($run_id: uuid!) {
    step_runs(where: { workflow_run_id: { _eq: $run_id } }, order_by: { position: asc }) {
      id
      position
      status
      workflow_step_id
      output
    }
  }
`;

const INCREMENT_QUOTA = `
  mutation IncrementQuota($id: uuid!) {
    update_organizations_by_pk(pk_columns: { id: $id }, _inc: { quota_used: 1 }) {
      id
      quota_used
      quota_limit
    }
  }
`;

const RESET_QUOTA = `
  mutation ResetQuota($id: uuid!, $start: timestamptz!) {
    update_organizations_by_pk(
      pk_columns: { id: $id }
      _set: { quota_used: 0, quota_period_start: $start }
    ) {
      id
      quota_used
    }
  }
`;

const INSERT_RESULT = `
  mutation InsertResult($object: workflow_results_insert_input!) {
    insert_workflow_results_one(object: $object) {
      id
    }
  }
`;

const INSERT_NOTIFY = `
  mutation InsertNotify($object: notify_events_insert_input!) {
    insert_notify_events_one(object: $object) {
      id
    }
  }
`;

async function getMembership(orgId, userId) {
  const data = await gql(GET_MEMBERSHIP, { org_id: orgId, user_id: userId });
  return data.org_members[0] || null;
}

async function ensureQuota(org) {
  const periodStart = new Date(org.quota_period_start);
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  if (periodStart < monthStart) {
    await gql(RESET_QUOTA, { id: org.id, start: monthStart.toISOString() });
    return { ...org, quota_used: 0, quota_period_start: monthStart.toISOString() };
  }
  return org;
}

function interpolate(value, context) {
  if (typeof value === 'string') {
    return value.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path) => {
      const parts = path.split('.');
      let cur = context;
      for (const p of parts) {
        if (cur == null) return '';
        cur = cur[p];
      }
      return cur == null ? '' : String(cur);
    });
  }
  if (Array.isArray(value)) return value.map((v) => interpolate(v, context));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = interpolate(v, context);
    return out;
  }
  return value;
}

async function callLlm(config, context) {
  const prompt = interpolate(config.prompt || 'Say hello', context);
  const apiKey = process.env.GROQ_API_KEY || process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    await sleep(800);
    const stub = {
      text: `STUB_LLM_RESPONSE: sentiment=positive; summary=${String(prompt).slice(0, 80)}`,
      model: 'stub-llm',
      stubbed: true,
    };
    return stub;
  }

  if (process.env.GROQ_API_KEY) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model || 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: config.system || 'You are a concise assistant.' },
          { role: 'user', content: prompt },
        ],
        temperature: config.temperature ?? 0.2,
        max_tokens: config.max_tokens || 256,
      }),
    });
    if (!res.ok) throw new Error(`LLM error ${res.status}: ${await res.text()}`);
    const json = await res.json();
    return {
      text: json.choices?.[0]?.message?.content || '',
      model: json.model,
      usage: json.usage,
    };
  }

  if (process.env.OPENROUTER_API_KEY) {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model || 'openai/gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`LLM error ${res.status}: ${await res.text()}`);
    const json = await res.json();
    return { text: json.choices?.[0]?.message?.content || '', model: json.model };
  }

  await sleep(800);
  return { text: `STUB_LLM_RESPONSE for: ${prompt}`, stubbed: true };
}

async function callHttp(config, context) {
  const url = interpolate(config.url, context);
  const method = (config.method || 'GET').toUpperCase();
  const headers = interpolate(config.headers || {}, context);
  const body = config.body != null ? interpolate(config.body, context) : undefined;

  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body != null && method !== 'GET' ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  }

  return { status: res.status, data };
}

async function withRetry(fn, attempts = 2) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      return { result: await fn(), attempts: i };
    } catch (err) {
      lastErr = err;
      if (i < attempts) await sleep(400 * i);
    }
  }
  throw lastErr;
}

function evalCondition(config, context, previousOutput) {
  const field = config.field || 'text';
  const op = config.op || 'contains';
  const expected = config.value;
  let actual = previousOutput;

  if (previousOutput && typeof previousOutput === 'object' && field) {
    const parts = field.split('.');
    actual = previousOutput;
    for (const p of parts) {
      if (actual == null) break;
      actual = actual[p];
    }
  }

  const actualStr = actual == null ? '' : String(actual).toLowerCase();
  const expectedStr = expected == null ? '' : String(expected).toLowerCase();

  switch (op) {
    case 'equals':
      return actualStr === expectedStr;
    case 'not_equals':
      return actualStr !== expectedStr;
    case 'contains':
      return actualStr.includes(expectedStr);
    case 'exists':
      return actual != null && actualStr !== '';
    default:
      return actualStr.includes(expectedStr);
  }
}

async function executeStep(step, stepRunId, context, orgId, runId) {
  const input = { context, config: step.config };
  await gql(UPDATE_STEP_RUN, {
    id: stepRunId,
    set: {
      status: 'running',
      input,
      started_at: new Date().toISOString(),
      attempt_count: 1,
    },
  });

  try {
    let output;
    let attempts = 1;

    switch (step.type) {
      case 'llm_call': {
        const r = await withRetry(() => callLlm(step.config || {}, context), 2);
        output = r.result;
        attempts = r.attempts;
        break;
      }
      case 'http_request': {
        const r = await withRetry(() => callHttp(step.config || {}, context), 2);
        output = r.result;
        attempts = r.attempts;
        break;
      }
      case 'db_write': {
        const key = interpolate(step.config?.key || 'result', context);
        const value = interpolate(step.config?.value ?? context.last_output ?? context, context);
        const inserted = await gql(INSERT_RESULT, {
          object: {
            org_id: orgId,
            workflow_run_id: runId,
            key: String(key),
            value,
          },
        });
        output = { saved: true, id: inserted.insert_workflow_results_one.id, key, value };
        break;
      }
      case 'notify': {
        const message = interpolate(
          step.config?.message || 'Workflow notification',
          context
        );
        const inserted = await gql(INSERT_NOTIFY, {
          object: {
            org_id: orgId,
            workflow_run_id: runId,
            channel: step.config?.channel || 'slack',
            message: String(message),
            payload: { context, config: step.config },
          },
        });
        output = { queued: true, notify_id: inserted.insert_notify_events_one.id, message };
        break;
      }
      case 'conditional_branch': {
        const passed = evalCondition(step.config || {}, context, context.last_output);
        output = {
          passed,
          branch: passed ? step.config?.true_branch || 'continue' : step.config?.false_branch || 'skip_next',
          evaluated_field: step.config?.field || 'text',
        };
        break;
      }
      case 'approval_gate': {
        await gql(UPDATE_STEP_RUN, {
          id: stepRunId,
          set: {
            status: 'paused',
            output: { awaiting_approval: true, message: step.config?.message || 'Approval required' },
            attempt_count: 1,
          },
        });
        return { paused: true, output: { awaiting_approval: true } };
      }
      default:
        throw new Error(`Unsupported step type: ${step.type}`);
    }

    await gql(UPDATE_STEP_RUN, {
      id: stepRunId,
      set: {
        status: 'completed',
        output,
        attempt_count: attempts,
        completed_at: new Date().toISOString(),
        error: null,
      },
    });

    return { paused: false, output, skipNext: output?.branch === 'skip_next' };
  } catch (err) {
    await gql(UPDATE_STEP_RUN, {
      id: stepRunId,
      set: {
        status: 'failed',
        error: err.message || String(err),
        completed_at: new Date().toISOString(),
      },
    });
    throw err;
  }
}

async function runFromPosition(runId, orgId, steps, stepRuns, startPosition, initialContext) {
  let context = { ...(initialContext || {}) };
  let skipNext = false;

  for (const step of steps) {
    if (step.position < startPosition) continue;

    const stepRun = stepRuns.find((s) => s.position === step.position);
    if (!stepRun) continue;

    if (skipNext) {
      await gql(UPDATE_STEP_RUN, {
        id: stepRun.id,
        set: {
          status: 'skipped',
          output: { skipped: true, reason: 'conditional_branch' },
          completed_at: new Date().toISOString(),
        },
      });
      skipNext = false;
      continue;
    }

    if (stepRun.status === 'completed' || stepRun.status === 'skipped') {
      if (stepRun.output) {
        context[`step_${step.position}`] = stepRun.output;
        context.last_output = stepRun.output;
      }
      continue;
    }

    await gql(UPDATE_RUN, {
      id: runId,
      set: {
        status: 'running',
        current_step_position: step.position,
        context,
      },
    });

    const result = await executeStep(step, stepRun.id, context, orgId, runId);

    if (result.paused) {
      await gql(UPDATE_RUN, {
        id: runId,
        set: {
          status: 'paused',
          current_step_position: step.position,
          context,
        },
      });
      return { status: 'paused', context };
    }

    context[`step_${step.position}`] = result.output;
    context.last_output = result.output;
    skipNext = Boolean(result.skipNext);
  }

  await gql(UPDATE_RUN, {
    id: runId,
    set: {
      status: 'completed',
      context,
      completed_at: new Date().toISOString(),
      current_step_position: null,
    },
  });

  await gql(INCREMENT_QUOTA, { id: orgId });
  return { status: 'completed', context };
}

async function startWorkflowRun({
  workflowId,
  userId,
  triggerType = 'manual',
  input = {},
  skipAuth = false,
}) {
  const wfData = await gql(GET_WORKFLOW, { id: workflowId });
  const workflow = wfData.workflows_by_pk;
  if (!workflow) throw new Error('Workflow not found');
  if (!workflow.is_active) throw new Error('Workflow is inactive');

  if (!skipAuth) {
    if (!userId) throw new Error('Authentication required');
    const membership = await getMembership(workflow.org_id, userId);
    if (!membership) throw new Error('Not a member of this organization');
    if (!['owner', 'editor'].includes(membership.role)) {
      throw new Error('Viewers cannot trigger workflow runs');
    }
  }

  let org = await ensureQuota(workflow.organization);
  if (org.quota_used >= org.quota_limit) {
    throw new Error('Organization monthly quota exhausted');
  }

  const run = await gql(CREATE_RUN, {
    object: {
      workflow_id: workflowId,
      org_id: workflow.org_id,
      status: 'pending',
      trigger_type: triggerType,
      triggered_by: userId || null,
      context: { input },
      started_at: new Date().toISOString(),
    },
  });

  const runId = run.insert_workflow_runs_one.id;
  const stepRunsData = await gql(CREATE_STEP_RUNS, {
    objects: workflow.steps.map((s) => ({
      workflow_run_id: runId,
      workflow_step_id: s.id,
      position: s.position,
      status: 'pending',
    })),
  });

  const stepRuns = stepRunsData.insert_step_runs.returning;

  try {
    const result = await runFromPosition(
      runId,
      workflow.org_id,
      workflow.steps,
      stepRuns,
      0,
      { input, trigger_type: triggerType }
    );
    return { run_id: runId, status: result.status, message: `Run ${result.status}` };
  } catch (err) {
    await gql(UPDATE_RUN, {
      id: runId,
      set: {
        status: 'failed',
        error: err.message || String(err),
        completed_at: new Date().toISOString(),
      },
    });
    return { run_id: runId, status: 'failed', message: err.message || String(err) };
  }
}

async function approveAndResume({ stepRunId, userId }) {
  if (!userId) throw new Error('Authentication required');

  const data = await gql(GET_STEP_RUN, { id: stepRunId });
  const stepRun = data.step_runs_by_pk;
  if (!stepRun) throw new Error('Step run not found');
  if (stepRun.status !== 'paused') throw new Error('Step is not awaiting approval');
  if (stepRun.workflow_step.type !== 'approval_gate') {
    throw new Error('Step is not an approval_gate');
  }

  const orgId = stepRun.workflow_run.org_id;
  const membership = await getMembership(orgId, userId);
  if (!membership) throw new Error('Not a member of this organization');
  if (!['owner', 'editor'].includes(membership.role)) {
    throw new Error('Only owners and editors can approve steps');
  }

  await gql(UPDATE_STEP_RUN, {
    id: stepRunId,
    set: {
      status: 'completed',
      approved_by: userId,
      approved_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      output: {
        approved: true,
        approved_by: userId,
        message: 'Approved',
      },
    },
  });

  const steps = stepRun.workflow_run.workflow.steps;
  const allStepRunsData = await gql(GET_STEP_RUNS, { run_id: stepRun.workflow_run_id });
  const allStepRuns = allStepRunsData.step_runs;

  const context = {
    ...(stepRun.workflow_run.context || {}),
    [`step_${stepRun.position}`]: { approved: true, approved_by: userId },
    last_output: { approved: true, approved_by: userId },
  };

  try {
    const result = await runFromPosition(
      stepRun.workflow_run_id,
      orgId,
      steps,
      allStepRuns,
      stepRun.position + 1,
      context
    );
    return {
      run_id: stepRun.workflow_run_id,
      status: result.status,
      message: `Run ${result.status} after approval`,
    };
  } catch (err) {
    await gql(UPDATE_RUN, {
      id: stepRun.workflow_run_id,
      set: {
        status: 'failed',
        error: err.message || String(err),
        completed_at: new Date().toISOString(),
      },
    });
    return {
      run_id: stepRun.workflow_run_id,
      status: 'failed',
      message: err.message || String(err),
    };
  }
}

module.exports = {
  startWorkflowRun,
  approveAndResume,
  getMembership,
  gql,
};
