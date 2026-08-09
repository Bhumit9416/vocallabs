/* Test inbound webhookTrigger against hosted Hasura */

const HASURA = process.env.HASURA_GRAPHQL_URL || 'http://localhost:8080';
const WORKFLOW_ID = process.env.WORKFLOW_ID || 'e35bff8a-fb05-4740-94a1-c4a8042742e0';
const SECRET = process.env.WEBHOOK_SECRET || 'org-a-webhook-secret';

async function main() {
  const url = HASURA.includes('/v1/graphql')
    ? HASURA
    : `${HASURA.replace(/\/$/, '')}/v1/graphql`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `
        mutation($workflow_id: uuid!, $secret: String!, $payload: jsonb) {
          webhookTrigger(workflow_id: $workflow_id, secret: $secret, payload: $payload) {
            run_id
            status
            message
          }
        }
      `,
      variables: {
        workflow_id: WORKFLOW_ID,
        secret: SECRET,
        payload: { lead: 'Webhook test lead', source: 'test-script' },
      },
    }),
  });

  const json = await res.json();
  if (json.errors?.length) {
    console.error('Webhook failed:', json.errors);
    process.exit(1);
  }

  console.log('Webhook OK:', json.data.webhookTrigger);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
