/* End-to-end smoke test for Final Task scenario */

const AUTH = 'http://localhost:4002';
const GQL = 'http://localhost:8080/v1/graphql';

async function signIn(email) {
  const res = await fetch(`${AUTH}/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'password123' }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message);
  return json.session;
}

async function gql(query, variables, token) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join('; '));
  return json.data;
}

async function main() {
  const ownerA = await signIn('owner.a@demo.local');
  const ownerB = await signIn('owner.b@demo.local');

  const orgs = await gql(
    `query { org_members { org_id role organization { name } } }`,
    {},
    ownerA.accessToken
  );
  console.log('Org A memberships:', orgs.org_members.map((m) => `${m.organization.name}:${m.role}`));

  const workflows = await gql(
    `query {
      workflows {
        id name
        steps(order_by: { position: asc }) { position type name }
      }
    }`,
    {},
    ownerA.accessToken
  );
  const wf = workflows.workflows[0];
  console.log('Workflow:', wf.name, wf.id);

  const run = await gql(
    `mutation($id: uuid!, $input: jsonb) {
      triggerWorkflowRun(workflow_id: $id, input: $input) {
        run_id status message
      }
    }`,
    { id: wf.id, input: { lead: 'Acme Corp positive lead' } },
    ownerA.accessToken
  );
  console.log('Run started:', run.triggerWorkflowRun);

  const runId = run.triggerWorkflowRun.run_id;
  await new Promise((r) => setTimeout(r, 2500));

  const steps = await gql(
    `query($runId: uuid!) {
      step_runs(where: { workflow_run_id: { _eq: $runId } }, order_by: { position: asc }) {
        id
        position status type: workflow_step { type name }
      }
      workflow_runs_by_pk(id: $runId) { status }
    }`,
    { runId },
    ownerA.accessToken
  );
  console.log('Run status:', steps.workflow_runs_by_pk.status);
  console.log(
    'Steps:',
    steps.step_runs.map((s) => `${s.position}:${s.type.type}:${s.status}`)
  );

  const paused = steps.step_runs.find((s) => s.status === 'paused');
  if (!paused) throw new Error('Expected paused approval_gate step');

  const approve = await gql(
    `mutation($stepRunId: uuid!) {
      approveStep(step_run_id: $stepRunId) { run_id status message }
    }`,
    { stepRunId: paused.id },
    ownerA.accessToken
  );
  console.log('Approved:', approve.approveStep);

  await new Promise((r) => setTimeout(r, 1500));
  const final = await gql(
    `query($runId: uuid!) {
      workflow_runs_by_pk(id: $runId) { status }
      step_runs(where: { workflow_run_id: { _eq: $runId } }, order_by: { position: asc }) {
        position status
      }
    }`,
    { runId },
    ownerA.accessToken
  );
  console.log('Final status:', final.workflow_runs_by_pk.status);

  // Cross-org isolation
  const cross = await fetch(GQL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ownerB.accessToken}`,
    },
    body: JSON.stringify({
      query: `query($id: uuid!) { workflows_by_pk(id: $id) { id name } }`,
      variables: { id: wf.id },
    }),
  }).then((r) => r.json());

  console.log('Org B access to Org A workflow:', cross.data?.workflows_by_pk ?? 'blocked/null');

  const crossApprove = await fetch(GQL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ownerB.accessToken}`,
    },
    body: JSON.stringify({
      query: `mutation($stepRunId: uuid!) { approveStep(step_run_id: $stepRunId) { status message } }`,
      variables: { stepRunId: paused.id },
    }),
  }).then((r) => r.json());

  console.log(
    'Org B approve attempt:',
    crossApprove.errors?.[0]?.message || crossApprove.data?.approveStep
  );

  console.log('Smoke test OK');
}

main().catch((err) => {
  console.error('Smoke test FAILED:', err.message);
  process.exit(1);
});
