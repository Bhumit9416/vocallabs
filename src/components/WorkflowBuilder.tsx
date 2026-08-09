'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { gql, useMutation } from '@apollo/client';
import { CREATE_WORKFLOW, UPDATE_WORKFLOW, DELETE_STEPS, INSERT_STEPS, UPSERT_TRIGGER } from '@/lib/graphql';
import { useAuth } from '@/lib/auth';
import { useOrg } from '@/lib/org';

const STEP_TYPES = [
  'llm_call',
  'http_request',
  'db_write',
  'notify',
  'conditional_branch',
  'approval_gate',
] as const;

type StepDraft = {
  key: string;
  type: (typeof STEP_TYPES)[number];
  name: string;
  configText: string;
};

const defaults: Record<string, string> = {
  llm_call: JSON.stringify(
    { prompt: 'Summarize: {{input.text}}', system: 'Be concise.' },
    null,
    2
  ),
  http_request: JSON.stringify({ url: 'https://httpbin.org/get', method: 'GET' }, null, 2),
  db_write: JSON.stringify({ key: 'result', value: { from: '{{last_output}}' } }, null, 2),
  notify: JSON.stringify({ channel: 'slack', message: 'Workflow update: {{input.text}}' }, null, 2),
  conditional_branch: JSON.stringify(
    {
      field: 'text',
      op: 'contains',
      value: 'positive',
      true_branch: 'continue',
      false_branch: 'skip_next',
    },
    null,
    2
  ),
  approval_gate: JSON.stringify({ message: 'Approve to continue' }, null, 2),
};

export function WorkflowBuilder({
  initial,
}: {
  initial?: {
    id: string;
    name: string;
    description?: string;
    steps: { type: string; name: string; config: Record<string, unknown> }[];
  };
}) {
  const { user } = useAuth();
  const { current, isOwner, canEdit } = useOrg();
  const router = useRouter();
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [webhook, setWebhook] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<StepDraft[]>(
    initial?.steps?.map((s, i) => ({
      key: `${i}`,
      type: s.type as StepDraft['type'],
      name: s.name,
      configText: JSON.stringify(s.config || {}, null, 2),
    })) || [
      {
        key: '0',
        type: 'llm_call',
        name: 'LLM step',
        configText: defaults.llm_call,
      },
      {
        key: '1',
        type: 'http_request',
        name: 'HTTP step',
        configText: defaults.http_request,
      },
      {
        key: '2',
        type: 'conditional_branch',
        name: 'Branch',
        configText: defaults.conditional_branch,
      },
    ]
  );

  const [createWorkflow] = useMutation(gql(CREATE_WORKFLOW));
  const [updateWorkflow] = useMutation(gql(UPDATE_WORKFLOW));
  const [deleteSteps] = useMutation(gql(DELETE_STEPS));
  const [insertSteps] = useMutation(gql(INSERT_STEPS));
  const [upsertTrigger] = useMutation(gql(UPSERT_TRIGGER));

  function addStep(type: StepDraft['type']) {
    if ((type === 'db_write' || type === 'notify') && !isOwner) {
      setError('Only owners can add db_write or notify steps');
      return;
    }
    setSteps((prev) => [
      ...prev,
      {
        key: String(Date.now()),
        type,
        name: type.replace('_', ' '),
        configText: defaults[type],
      },
    ]);
  }

  function move(index: number, dir: -1 | 1) {
    setSteps((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function save() {
    if (!current || !user || !canEdit) return;
    setBusy(true);
    setError('');
    try {
      for (const s of steps) {
        if ((s.type === 'db_write' || s.type === 'notify') && !isOwner) {
          throw new Error('Only owners can include db_write or notify steps');
        }
        JSON.parse(s.configText);
      }

      let workflowId = initial?.id;
      if (!workflowId) {
        const res = await createWorkflow({
          variables: {
            object: {
              org_id: current.org_id,
              name,
              description,
              created_by: user.id,
            },
          },
        });
        workflowId = res.data.insert_workflows_one.id;
      } else {
        await updateWorkflow({
          variables: {
            id: workflowId,
            set: { name, description, updated_at: new Date().toISOString() },
          },
        });
        await deleteSteps({ variables: { workflowId } });
      }

      await insertSteps({
        variables: {
          objects: steps.map((s, position) => ({
            workflow_id: workflowId,
            position,
            type: s.type,
            name: s.name,
            config: JSON.parse(s.configText),
          })),
        },
      });

      await upsertTrigger({
        variables: {
          object: {
            workflow_id: workflowId,
            type: 'manual',
            is_active: true,
            config: {},
          },
        },
      });

      if (webhook) {
        if (!isOwner) throw new Error('Only owners can attach webhook triggers');
        await upsertTrigger({
          variables: {
            object: {
              workflow_id: workflowId,
              type: 'webhook',
              is_active: true,
              config: {},
              secret: `wh_${workflowId?.slice(0, 8)}`,
            },
          },
        });
      }

      router.push(`/workflows/${workflowId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid-2">
      <section className="panel">
        <h2>{initial ? 'Edit workflow' : 'Build workflow'}</h2>
        {error && <div className="error">{error}</div>}
        <div className="field">
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label>Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="field">
          <label>
            <input
              type="checkbox"
              checked={webhook}
              onChange={(e) => setWebhook(e.target.checked)}
              disabled={!isOwner}
            />{' '}
            Attach webhook trigger {isOwner ? '' : '(owner only)'}
          </label>
        </div>

        <h3>Steps</h3>
        {steps.map((step, index) => (
          <div key={step.key} className="step-row">
            <div className="step-index">{index + 1}</div>
            <div>
              <div className="field">
                <label>Name</label>
                <input
                  value={step.name}
                  onChange={(e) =>
                    setSteps((prev) =>
                      prev.map((s) => (s.key === step.key ? { ...s, name: e.target.value } : s))
                    )
                  }
                />
              </div>
              <div className="field">
                <label>Type</label>
                <select
                  value={step.type}
                  onChange={(e) => {
                    const type = e.target.value as StepDraft['type'];
                    setSteps((prev) =>
                      prev.map((s) =>
                        s.key === step.key
                          ? { ...s, type, configText: defaults[type] }
                          : s
                      )
                    );
                  }}
                >
                  {STEP_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Config (JSON)</label>
                <textarea
                  className="mono"
                  value={step.configText}
                  onChange={(e) =>
                    setSteps((prev) =>
                      prev.map((s) =>
                        s.key === step.key ? { ...s, configText: e.target.value } : s
                      )
                    )
                  }
                />
              </div>
            </div>
            <div className="row" style={{ flexDirection: 'column' }}>
              <button className="btn" type="button" onClick={() => move(index, -1)}>
                Up
              </button>
              <button className="btn" type="button" onClick={() => move(index, 1)}>
                Down
              </button>
              <button
                className="btn btn-danger"
                type="button"
                onClick={() => setSteps((prev) => prev.filter((s) => s.key !== step.key))}
              >
                Remove
              </button>
            </div>
          </div>
        ))}

        <div className="row" style={{ marginTop: '1rem' }}>
          <button className="btn btn-primary" type="button" disabled={busy || !name} onClick={save}>
            {busy ? 'Saving…' : 'Save workflow'}
          </button>
        </div>
      </section>

      <aside className="panel">
        <h3>Add step</h3>
        <p className="muted">db_write, notify, and webhook triggers require owner role.</p>
        <div className="list">
          {STEP_TYPES.map((t) => (
            <button key={t} className="btn" type="button" onClick={() => addStep(t)}>
              + {t}
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
}
