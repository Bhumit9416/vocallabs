/* Hotfix: allow select on workflow_triggers.secret for user role */

const HASURA = (process.env.HASURA_GRAPHQL_URL || 'http://localhost:8080').replace(
  /\/v1\/graphql\/?$/,
  ''
);
const ADMIN = process.env.HASURA_GRAPHQL_ADMIN_SECRET || 'local-admin-secret';

async function metadata(type, args) {
  const res = await fetch(`${HASURA}/v1/metadata`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hasura-admin-secret': ADMIN,
    },
    body: JSON.stringify({ type, args }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json;
}

function orgMemberFilter() {
  return {
    workflow: {
      organization: {
        members: {
          user_id: { _eq: 'X-Hasura-User-Id' },
        },
      },
    },
  };
}

async function main() {
  try {
    await metadata('pg_drop_select_permission', {
      source: 'default',
      table: { schema: 'public', name: 'workflow_triggers' },
      role: 'user',
    });
  } catch {
    /* permission may not exist yet */
  }

  await metadata('pg_create_select_permission', {
    source: 'default',
    table: { schema: 'public', name: 'workflow_triggers' },
    role: 'user',
    permission: {
      columns: ['id', 'workflow_id', 'type', 'config', 'is_active', 'secret', 'created_at'],
      filter: orgMemberFilter(),
    },
  });

  console.log('workflow_triggers.secret is now readable by user role');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
