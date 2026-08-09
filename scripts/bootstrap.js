/* Applies Hasura metadata and seeds the Final Task demo data. */

const HASURA_RAW = process.env.HASURA_GRAPHQL_URL || 'http://localhost:8080';
const HASURA = HASURA_RAW.replace(/\/v1\/graphql\/?$/, '').replace(/\/$/, '');
const ADMIN = process.env.HASURA_GRAPHQL_ADMIN_SECRET || 'local-admin-secret';
const AUTH = process.env.AUTH_URL || 'http://localhost:4002';
const FUNCTIONS = process.env.FUNCTIONS_URL || 'http://localhost:4001';
// URL Hasura container uses to reach functions (docker network)
const FUNCTIONS_FROM_HASURA =
  process.env.FUNCTIONS_FROM_HASURA || 'http://functions:4001';

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitFor(url, label) {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) {
        console.log(`${label} ready`);
        return;
      }
    } catch {}
    await sleep(2000);
  }
  throw new Error(`${label} not ready`);
}

async function metadata(type, args = {}) {
  const res = await fetch(`${HASURA}/v1/metadata`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hasura-admin-secret': ADMIN,
    },
    body: JSON.stringify({ type, args }),
  });
  const json = await res.json();
  if (!res.ok || json.error || json.code === 'already-tracked') {
    if (String(json?.code || '').includes('already') || String(json?.error || '').includes('already')) {
      return json;
    }
  }
  if (json.error) {
    console.warn('metadata warn', type, json.error || json);
  }
  return json;
}

async function gql(query, variables = {}, token) {
  const headers = {
    'Content-Type': 'application/json',
    'x-hasura-admin-secret': ADMIN,
  };
  if (token) {
    delete headers['x-hasura-admin-secret'];
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${HASURA}/v1/graphql`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join('; '));
  return json.data;
}

async function trackTables() {
  const tables = [
    'organizations',
    'org_members',
    'workflows',
    'workflow_steps',
    'workflow_triggers',
    'workflow_runs',
    'step_runs',
    'watched_events',
    'workflow_results',
    'notify_events',
    'org_usage_stats',
  ];

  for (const name of tables) {
    await metadata('pg_track_table', {
      source: 'default',
      table: { schema: 'public', name },
    });
  }
}

async function createRelationships() {
  const rels = [
    {
      type: 'pg_create_array_relationship',
      args: {
        source: 'default',
        table: { schema: 'public', name: 'organizations' },
        name: 'members',
        using: { foreign_key_constraint_on: { table: { schema: 'public', name: 'org_members' }, column: 'org_id' } },
      },
    },
    {
      type: 'pg_create_array_relationship',
      args: {
        source: 'default',
        table: { schema: 'public', name: 'organizations' },
        name: 'workflows',
        using: { foreign_key_constraint_on: { table: { schema: 'public', name: 'workflows' }, column: 'org_id' } },
      },
    },
    {
      type: 'pg_create_object_relationship',
      args: {
        source: 'default',
        table: { schema: 'public', name: 'org_members' },
        name: 'organization',
        using: { foreign_key_constraint_on: 'org_id' },
      },
    },
    {
      type: 'pg_create_object_relationship',
      args: {
        source: 'default',
        table: { schema: 'public', name: 'workflows' },
        name: 'organization',
        using: { foreign_key_constraint_on: 'org_id' },
      },
    },
    {
      type: 'pg_create_array_relationship',
      args: {
        source: 'default',
        table: { schema: 'public', name: 'workflows' },
        name: 'steps',
        using: { foreign_key_constraint_on: { table: { schema: 'public', name: 'workflow_steps' }, column: 'workflow_id' } },
      },
    },
    {
      type: 'pg_create_array_relationship',
      args: {
        source: 'default',
        table: { schema: 'public', name: 'workflows' },
        name: 'triggers',
        using: { foreign_key_constraint_on: { table: { schema: 'public', name: 'workflow_triggers' }, column: 'workflow_id' } },
      },
    },
    {
      type: 'pg_create_array_relationship',
      args: {
        source: 'default',
        table: { schema: 'public', name: 'workflows' },
        name: 'runs',
        using: { foreign_key_constraint_on: { table: { schema: 'public', name: 'workflow_runs' }, column: 'workflow_id' } },
      },
    },
    {
      type: 'pg_create_object_relationship',
      args: {
        source: 'default',
        table: { schema: 'public', name: 'workflow_steps' },
        name: 'workflow',
        using: { foreign_key_constraint_on: 'workflow_id' },
      },
    },
    {
      type: 'pg_create_object_relationship',
      args: {
        source: 'default',
        table: { schema: 'public', name: 'workflow_triggers' },
        name: 'workflow',
        using: { foreign_key_constraint_on: 'workflow_id' },
      },
    },
    {
      type: 'pg_create_object_relationship',
      args: {
        source: 'default',
        table: { schema: 'public', name: 'workflow_runs' },
        name: 'workflow',
        using: { foreign_key_constraint_on: 'workflow_id' },
      },
    },
    {
      type: 'pg_create_object_relationship',
      args: {
        source: 'default',
        table: { schema: 'public', name: 'workflow_runs' },
        name: 'organization',
        using: { foreign_key_constraint_on: 'org_id' },
      },
    },
    {
      type: 'pg_create_array_relationship',
      args: {
        source: 'default',
        table: { schema: 'public', name: 'workflow_runs' },
        name: 'step_runs',
        using: { foreign_key_constraint_on: { table: { schema: 'public', name: 'step_runs' }, column: 'workflow_run_id' } },
      },
    },
    {
      type: 'pg_create_object_relationship',
      args: {
        source: 'default',
        table: { schema: 'public', name: 'step_runs' },
        name: 'workflow_run',
        using: { foreign_key_constraint_on: 'workflow_run_id' },
      },
    },
    {
      type: 'pg_create_object_relationship',
      args: {
        source: 'default',
        table: { schema: 'public', name: 'step_runs' },
        name: 'workflow_step',
        using: { foreign_key_constraint_on: 'workflow_step_id' },
      },
    },
    {
      type: 'pg_create_object_relationship',
      args: {
        source: 'default',
        table: { schema: 'public', name: 'org_usage_stats' },
        name: 'organization',
        using: {
          manual_configuration:
            {
              remote_table: { schema: 'public', name: 'organizations' },
              column_mapping: { org_id: 'id' },
            },
        },
      },
    },
    {
      type: 'pg_create_object_relationship',
      args: {
        source: 'default',
        table: { schema: 'public', name: 'watched_events' },
        name: 'organization',
        using: { foreign_key_constraint_on: 'org_id' },
      },
    },
    {
      type: 'pg_create_object_relationship',
      args: {
        source: 'default',
        table: { schema: 'public', name: 'workflow_results' },
        name: 'organization',
        using: { foreign_key_constraint_on: 'org_id' },
      },
    },
    {
      type: 'pg_create_object_relationship',
      args: {
        source: 'default',
        table: { schema: 'public', name: 'notify_events' },
        name: 'organization',
        using: { foreign_key_constraint_on: 'org_id' },
      },
    },
  ];

  for (const rel of rels) {
    await metadata(rel.type, rel.args);
  }
}

function orgMemberFilter() {
  return {
    organization: {
      members: {
        user_id: { _eq: 'X-Hasura-User-Id' },
      },
    },
  };
}

function ownerEditorFilter() {
  return {
    organization: {
      members: {
        _and: [
          { user_id: { _eq: 'X-Hasura-User-Id' } },
          { role: { _in: ['owner', 'editor'] } },
        ],
      },
    },
  };
}

function ownerFilter() {
  return {
    organization: {
      members: {
        _and: [
          { user_id: { _eq: 'X-Hasura-User-Id' } },
          { role: { _eq: 'owner' } },
        ],
      },
    },
  };
}

async function createPermissions() {
  const perms = [
    // organizations
    {
      type: 'pg_create_select_permission',
      args: {
        source: 'default',
        table: { schema: 'public', name: 'organizations' },
        role: 'user',
        permission: {
          columns: ['id', 'name', 'quota_limit', 'quota_used', 'quota_period_start', 'created_at', 'updated_at'],
          filter: { members: { user_id: { _eq: 'X-Hasura-User-Id' } } },
          allow_aggregations: true,
        },
      },
    },
    {
      type: 'pg_create_insert_permission',
      args: {
        source: 'default',
        table: { schema: 'public', name: 'organizations' },
        role: 'user',
        permission: {
          columns: ['name', 'quota_limit'],
          check: {},
        },
      },
    },
    // org_members
    {
      type: 'pg_create_select_permission',
      args: {
        source: 'default',
        table: { schema: 'public', name: 'org_members' },
        role: 'user',
        permission: {
          columns: ['id', 'org_id', 'user_id', 'role', 'created_at'],
          filter: {
            _or: [
              { user_id: { _eq: 'X-Hasura-User-Id' } },
              {
                organization: {
                  members: {
                    _and: [
                      { user_id: { _eq: 'X-Hasura-User-Id' } },
                      { role: { _eq: 'owner' } },
                    ],
                  },
                },
              },
            ],
          },
        },
      },
    },
    {
      type: 'pg_create_insert_permission',
      args: {
        source: 'default',
        table: { schema: 'public', name: 'org_members' },
        role: 'user',
        permission: {
          columns: ['org_id', 'user_id', 'role'],
          check: {
            _or: [
              { user_id: { _eq: 'X-Hasura-User-Id' } },
              ownerFilter(),
            ],
          },
        },
      },
    },
    // workflows
    {
      type: 'pg_create_select_permission',
      args: {
        source: 'default',
        table: { schema: 'public', name: 'workflows' },
        role: 'user',
        permission: {
          columns: ['id', 'org_id', 'name', 'description', 'is_active', 'created_by', 'created_at', 'updated_at'],
          filter: orgMemberFilter(),
          allow_aggregations: true,
        },
      },
    },
    {
      type: 'pg_create_insert_permission',
      args: {
        source: 'default',
        table: { schema: 'public', name: 'workflows' },
        role: 'user',
        permission: {
          columns: ['org_id', 'name', 'description', 'is_active', 'created_by'],
          check: ownerEditorFilter(),
        },
      },
    },
    {
      type: 'pg_create_update_permission',
      args: {
        source: 'default',
        table: { schema: 'public', name: 'workflows' },
        role: 'user',
        permission: {
          columns: ['name', 'description', 'is_active', 'updated_at'],
          filter: ownerEditorFilter(),
          check: null,
        },
      },
    },
    {
      type: 'pg_create_delete_permission',
      args: {
        source: 'default',
        table: { schema: 'public', name: 'workflows' },
        role: 'user',
        permission: { filter: ownerFilter() },
      },
    },
    // workflow_steps
    {
      type: 'pg_create_select_permission',
      args: {
        source: 'default',
        table: { schema: 'public', name: 'workflow_steps' },
        role: 'user',
        permission: {
          columns: ['id', 'workflow_id', 'position', 'type', 'name', 'config', 'created_at', 'updated_at'],
          filter: { workflow: orgMemberFilter() },
        },
      },
    },
    {
      type: 'pg_create_insert_permission',
      args: {
        source: 'default',
        table: { schema: 'public', name: 'workflow_steps' },
        role: 'user',
        permission: {
          columns: ['workflow_id', 'position', 'type', 'name', 'config'],
          check: { workflow: ownerEditorFilter() },
        },
      },
    },
    {
      type: 'pg_create_update_permission',
      args: {
        source: 'default',
        table: { schema: 'public', name: 'workflow_steps' },
        role: 'user',
        permission: {
          columns: ['position', 'type', 'name', 'config', 'updated_at'],
          filter: { workflow: ownerEditorFilter() },
          check: null,
        },
      },
    },
    {
      type: 'pg_create_delete_permission',
      args: {
        source: 'default',
        table: { schema: 'public', name: 'workflow_steps' },
        role: 'user',
        permission: { filter: { workflow: ownerEditorFilter() } },
      },
    },
    // workflow_triggers
    {
      type: 'pg_create_select_permission',
      args: {
        source: 'default',
        table: { schema: 'public', name: 'workflow_triggers' },
        role: 'user',
        permission: {
          columns: ['id', 'workflow_id', 'type', 'config', 'is_active', 'secret', 'created_at'],
          filter: { workflow: orgMemberFilter() },
        },
      },
    },
    {
      type: 'pg_create_insert_permission',
      args: {
        source: 'default',
        table: { schema: 'public', name: 'workflow_triggers' },
        role: 'user',
        permission: {
          columns: ['workflow_id', 'type', 'config', 'is_active', 'secret'],
          check: { workflow: ownerEditorFilter() },
        },
      },
    },
    {
      type: 'pg_create_update_permission',
      args: {
        source: 'default',
        table: { schema: 'public', name: 'workflow_triggers' },
        role: 'user',
        permission: {
          columns: ['type', 'config', 'is_active', 'secret'],
          filter: { workflow: ownerEditorFilter() },
          check: null,
        },
      },
    },
    // workflow_runs
    {
      type: 'pg_create_select_permission',
      args: {
        source: 'default',
        table: { schema: 'public', name: 'workflow_runs' },
        role: 'user',
        permission: {
          columns: [
            'id', 'workflow_id', 'org_id', 'status', 'trigger_type', 'triggered_by',
            'current_step_position', 'context', 'error', 'started_at', 'completed_at', 'created_at',
          ],
          filter: orgMemberFilter(),
          allow_aggregations: true,
        },
      },
    },
    // step_runs
    {
      type: 'pg_create_select_permission',
      args: {
        source: 'default',
        table: { schema: 'public', name: 'step_runs' },
        role: 'user',
        permission: {
          columns: [
            'id', 'workflow_run_id', 'workflow_step_id', 'position', 'status', 'input', 'output',
            'error', 'attempt_count', 'approved_by', 'approved_at', 'started_at', 'completed_at', 'created_at',
          ],
          filter: { workflow_run: orgMemberFilter() },
        },
      },
    },
    // org_usage_stats
    {
      type: 'pg_create_select_permission',
      args: {
        source: 'default',
        table: { schema: 'public', name: 'org_usage_stats' },
        role: 'user',
        permission: {
          columns: [
            'org_id', 'org_name', 'quota_limit', 'quota_used', 'quota_period_start',
            'runs_this_month', 'avg_run_duration_seconds',
          ],
          filter: {
            organization: {
              members: { user_id: { _eq: 'X-Hasura-User-Id' } },
            },
          },
        },
      },
    },
    // watched_events / results / notify select
    {
      type: 'pg_create_select_permission',
      args: {
        source: 'default',
        table: { schema: 'public', name: 'watched_events' },
        role: 'user',
        permission: {
          columns: ['id', 'org_id', 'event_type', 'payload', 'created_at'],
          filter: { organization: { members: { user_id: { _eq: 'X-Hasura-User-Id' } } } },
        },
      },
    },
    {
      type: 'pg_create_insert_permission',
      args: {
        source: 'default',
        table: { schema: 'public', name: 'watched_events' },
        role: 'user',
        permission: {
          columns: ['org_id', 'event_type', 'payload'],
          check: {
            organization: {
              members: {
                _and: [
                  { user_id: { _eq: 'X-Hasura-User-Id' } },
                  { role: { _in: ['owner', 'editor'] } },
                ],
              },
            },
          },
        },
      },
    },
    {
      type: 'pg_create_select_permission',
      args: {
        source: 'default',
        table: { schema: 'public', name: 'workflow_results' },
        role: 'user',
        permission: {
          columns: ['id', 'org_id', 'workflow_run_id', 'key', 'value', 'created_at'],
          filter: { organization: { members: { user_id: { _eq: 'X-Hasura-User-Id' } } } },
        },
      },
    },
    {
      type: 'pg_create_select_permission',
      args: {
        source: 'default',
        table: { schema: 'public', name: 'notify_events' },
        role: 'user',
        permission: {
          columns: ['id', 'org_id', 'workflow_run_id', 'channel', 'message', 'payload', 'created_at'],
          filter: { organization: { members: { user_id: { _eq: 'X-Hasura-User-Id' } } } },
        },
      },
    },
  ];

  for (const p of perms) {
    await metadata(p.type, p.args);
  }
}

async function createActions() {
  await metadata('set_custom_types', {
    scalars: [],
    enums: [],
    input_objects: [],
    objects: [
      {
        name: 'TriggerWorkflowRunOutput',
        fields: [
          { name: 'run_id', type: 'uuid!' },
          { name: 'status', type: 'String!' },
          { name: 'message', type: 'String' },
        ],
      },
      {
        name: 'ApproveStepOutput',
        fields: [
          { name: 'run_id', type: 'uuid!' },
          { name: 'status', type: 'String!' },
          { name: 'message', type: 'String' },
        ],
      },
      {
        name: 'WebhookTriggerOutput',
        fields: [
          { name: 'run_id', type: 'uuid!' },
          { name: 'status', type: 'String!' },
          { name: 'message', type: 'String' },
        ],
      },
    ],
  });

  const actions = [
    {
      name: 'triggerWorkflowRun',
      definition: {
        kind: 'synchronous',
        handler: `${FUNCTIONS_FROM_HASURA}/trigger-workflow-run`,
        forward_client_headers: true,
        timeout: 300,
      },
      permissions: [{ role: 'user' }],
    },
    {
      name: 'approveStep',
      definition: {
        kind: 'synchronous',
        handler: `${FUNCTIONS_FROM_HASURA}/approve-step`,
        forward_client_headers: true,
        timeout: 300,
      },
      permissions: [{ role: 'user' }],
    },
    {
      name: 'webhookTrigger',
      definition: {
        kind: 'synchronous',
        handler: `${FUNCTIONS_FROM_HASURA}/webhook-trigger`,
        forward_client_headers: true,
        timeout: 300,
      },
      permissions: [{ role: 'user' }, { role: 'public' }],
    },
  ];

  for (const action of actions) {
    await metadata('create_action', {
      name: action.name,
      definition: {
        ...action.definition,
        arguments: action.name === 'approveStep'
          ? [{ name: 'step_run_id', type: 'uuid!' }]
          : action.name === 'webhookTrigger'
            ? [
              { name: 'workflow_id', type: 'uuid!' },
              { name: 'secret', type: 'String!' },
              { name: 'payload', type: 'jsonb' },
            ]
            : [
              { name: 'workflow_id', type: 'uuid!' },
              { name: 'input', type: 'jsonb' },
            ],
        output_type:
          action.name === 'approveStep'
            ? 'ApproveStepOutput'
            : action.name === 'webhookTrigger'
              ? 'WebhookTriggerOutput'
              : 'TriggerWorkflowRunOutput',
        type: 'mutation',
      },
    });
    for (const perm of action.permissions) {
      await metadata('create_action_permission', {
        action: action.name,
        role: perm.role,
      });
    }
  }
}

async function createEventTriggers() {
  await metadata('pg_create_event_trigger', {
    source: 'default',
    table: { schema: 'public', name: 'notify_events' },
    name: 'notify_event_insert',
    webhook: `${FUNCTIONS_FROM_HASURA}/notify-handler`,
    insert: { columns: '*' },
    retry_conf: { num_retries: 3, interval_sec: 10, timeout_sec: 60 },
    headers: [{ name: 'x-nhost-webhook-secret', value: 'local-webhook-secret' }],
  });

  await metadata('pg_create_event_trigger', {
    source: 'default',
    table: { schema: 'public', name: 'watched_events' },
    name: 'watched_event_insert',
    webhook: `${FUNCTIONS_FROM_HASURA}/db-event-trigger`,
    insert: { columns: '*' },
    retry_conf: { num_retries: 3, interval_sec: 10, timeout_sec: 60 },
    headers: [{ name: 'x-nhost-webhook-secret', value: 'local-webhook-secret' }],
  });
}

async function createCron() {
  await metadata('create_cron_trigger', {
    name: 'scheduled_workflow_tick',
    webhook: `${FUNCTIONS_FROM_HASURA}/scheduled-trigger`,
    schedule: '*/5 * * * *',
    payload: {},
    headers: [{ name: 'x-nhost-webhook-secret', value: 'local-webhook-secret' }],
    retry_conf: {
      num_retries: 1,
      retry_interval_seconds: 30,
      timeout_seconds: 120,
      tolerance_seconds: 21600,
    },
    include_in_metadata: true,
  });
}

async function signup(email, password, displayName) {
  const res = await fetch(`${AUTH}/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, displayName }),
  });
  const json = await res.json();
  if (!res.ok) {
    // try signin if exists
    const res2 = await fetch(`${AUTH}/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const json2 = await res2.json();
    if (!res2.ok) throw new Error(json.message || json2.message);
    return json2.session;
  }
  return json.session;
}

async function seed() {
  const ownerA = await signup('owner.a@demo.local', 'password123', 'Owner A');
  const editorA = await signup('editor.a@demo.local', 'password123', 'Editor A');
  const viewerA = await signup('viewer.a@demo.local', 'password123', 'Viewer A');
  const ownerB = await signup('owner.b@demo.local', 'password123', 'Owner B');

  const orgA = await gql(
    `mutation($object: organizations_insert_input!) {
      insert_organizations_one(object: $object) { id name }
    }`,
    { object: { name: 'Org A', quota_limit: 100, quota_used: 0 } }
  );
  const orgB = await gql(
    `mutation($object: organizations_insert_input!) {
      insert_organizations_one(object: $object) { id name }
    }`,
    { object: { name: 'Org B', quota_limit: 100, quota_used: 0 } }
  );

  const orgAId = orgA.insert_organizations_one.id;
  const orgBId = orgB.insert_organizations_one.id;

  const members = [
    { org_id: orgAId, user_id: ownerA.user.id, role: 'owner' },
    { org_id: orgAId, user_id: editorA.user.id, role: 'editor' },
    { org_id: orgAId, user_id: viewerA.user.id, role: 'viewer' },
    { org_id: orgBId, user_id: ownerB.user.id, role: 'owner' },
  ];

  for (const m of members) {
    await gql(
      `mutation($object: org_members_insert_input!) {
        insert_org_members_one(object: $object) { id }
      }`,
      { object: m }
    );
  }

  const wf = await gql(
    `mutation($object: workflows_insert_input!) {
      insert_workflows_one(object: $object) { id }
    }`,
    {
      object: {
        org_id: orgAId,
        name: 'Lead Qualification Pipeline',
        description: 'LLM classify → HTTP enrich → branch → approval → notify',
        created_by: ownerA.user.id,
        steps: {
          data: [
            {
              position: 0,
              type: 'llm_call',
              name: 'Classify lead',
              config: {
                prompt:
                  'Classify this lead as positive or negative. Lead: {{input.lead}}. Reply with sentiment=positive or sentiment=negative.',
                system: 'Answer briefly and include sentiment=positive or sentiment=negative.',
              },
            },
            {
              position: 1,
              type: 'http_request',
              name: 'Fetch public IP metadata',
              config: {
                url: 'https://httpbin.org/json',
                method: 'GET',
              },
            },
            {
              position: 2,
              type: 'conditional_branch',
              name: 'Branch on sentiment',
              config: {
                field: 'text',
                op: 'contains',
                value: 'positive',
                true_branch: 'continue',
                false_branch: 'skip_next',
              },
            },
            {
              position: 3,
              type: 'db_write',
              name: 'Store qualified lead',
              config: {
                key: 'qualified_lead',
                value: { lead: '{{input.lead}}', llm: '{{step_0}}', http: '{{step_1}}' },
              },
            },
            {
              position: 4,
              type: 'approval_gate',
              name: 'Manager approval',
              config: { message: 'Approve sending the notification?' },
            },
            {
              position: 5,
              type: 'notify',
              name: 'Notify channel',
              config: {
                channel: 'slack',
                message: 'Lead pipeline completed for {{input.lead}}',
              },
            },
          ],
        },
        triggers: {
          data: [
            { type: 'manual', config: {}, is_active: true },
            {
              type: 'webhook',
              config: {},
              is_active: true,
              secret: 'org-a-webhook-secret',
            },
            {
              type: 'database_event',
              config: { event_type: 'lead_created' },
              is_active: true,
            },
          ],
        },
      },
    }
  );

  console.log(
    JSON.stringify(
      {
        orgAId,
        orgBId,
        workflowId: wf.insert_workflows_one.id,
        users: {
          ownerA: ownerA.user.email,
          editorA: editorA.user.email,
          viewerA: viewerA.user.email,
          ownerB: ownerB.user.email,
        },
        password: 'password123',
        webhookSecret: 'org-a-webhook-secret',
      },
      null,
      2
    )
  );
}

async function main() {
  const mode = process.argv[2] || 'all';
  await waitFor(`${HASURA}/healthz`, 'Hasura');
  await waitFor(`${FUNCTIONS}/health`, 'Functions');
  await waitFor(`${AUTH}/health`, 'Auth');

  if (mode === 'all' || mode === 'metadata') {
    console.log('Tracking tables...');
    await trackTables();
    console.log('Creating relationships...');
    await createRelationships();
    console.log('Creating permissions...');
    await createPermissions();
    console.log('Creating actions...');
    await createActions();
    console.log('Creating event triggers...');
    await createEventTriggers();
    console.log('Creating cron trigger...');
    await createCron();
  }

  if (mode === 'all' || mode === 'seed') {
    console.log('Seeding demo data...');
    await seed();
  }

  console.log('Bootstrap complete');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
