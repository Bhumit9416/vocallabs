'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { gql, useMutation, useQuery, useSubscription } from '@apollo/client';
import {
  APPROVE_STEP,
  INSERT_WATCHED_EVENT,
  TRIGGER_RUN,
  WORKFLOW_DETAIL_QUERY,
  STEP_RUNS_SUB,
} from '@/lib/graphql';
import { useAuth } from '@/lib/auth';
import { useOrg } from '@/lib/org';
import { Topbar } from '@/components/Topbar';
import { config } from '@/lib/config';
import type { StepRun, WorkflowDetail } from '@/lib/types';

export default function WorkflowDetailPage() {
  const params = useParams<{ id: string }>();
  const workflowId = params.id;
  const { user, loading: authLoading } = useAuth();
  const { current, canRun } = useOrg();
  const router = useRouter();
  const [runId, setRunId] = useState<string | null>(null);
  const [lead, setLead] = useState('Acme Corp — interested in enterprise plan');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const { data, loading, error: queryError, refetch } = useQuery(gql(WORKFLOW_DETAIL_QUERY), {
    variables: { id: workflowId },
    skip: !user,
  });

  const [triggerRun] = useMutation(gql(TRIGGER_RUN));
  const [approveStep] = useMutation(gql(APPROVE_STEP));
  const [insertWatched] = useMutation(gql(INSERT_WATCHED_EVENT));

  const { data: live } = useSubscription(gql(STEP_RUNS_SUB), {
    variables: { runId },
    skip: !runId,
  });

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [authLoading, user, router]);

  const workflow = data?.workflows_by_pk as WorkflowDetail | null | undefined;

  async function onRun() {
    setBusy(true);
    setError('');
    try {
      const res = await triggerRun({
        variables: {
          workflowId,
          input: { lead, text: lead },
        },
      });
      setRunId(res.data.triggerWorkflowRun.run_id);
      refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Run failed');
    } finally {
      setBusy(false);
    }
  }

  async function onApprove(stepRunId: string) {
    setBusy(true);
    setError('');
    try {
      const res = await approveStep({ variables: { stepRunId } });
      setRunId(res.data.approveStep.run_id);
      refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approve failed');
    } finally {
      setBusy(false);
    }
  }

  async function onWebhookTest() {
    setBusy(true);
    setError('');
    try {
      const secret =
        workflow?.triggers?.find((t) => t.type === 'webhook')?.secret ||
        'org-a-webhook-secret';
      const res = await fetch(config.graphqlUrl, {
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
            workflow_id: workflowId,
            secret,
            payload: { lead, source: 'webhook' },
          },
        }),
      });
      const json = await res.json();
      if (json.errors?.length) throw new Error(json.errors[0].message);
      setRunId(json.data.webhookTrigger.run_id);
      refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Webhook failed');
    } finally {
      setBusy(false);
    }
  }

  async function onDbEvent() {
    if (!current) return;
    setBusy(true);
    setError('');
    try {
      await insertWatched({
        variables: {
          object: {
            org_id: current.org_id,
            event_type: 'lead_created',
            payload: { lead },
          },
        },
      });
      setTimeout(() => refetch(), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Event insert failed');
    } finally {
      setBusy(false);
    }
  }

  if (authLoading || loading) {
    return (
      <div className="login-wrap">
        <div className="muted">Loading workflow…</div>
      </div>
    );
  }

  if (queryError || !workflow) {
    return (
      <div className="app-shell">
        <Topbar />
        <main className="main">
          <div className="panel">
            <h2>Workflow not available</h2>
            <p className="muted">
              {queryError?.message ||
                'This workflow is not visible to your organization (cross-org isolation).'}
            </p>
            <button className="btn" type="button" onClick={() => router.push('/dashboard')}>
              Back to dashboard
            </button>
          </div>
        </main>
      </div>
    );
  }

  const stepRuns: StepRun[] = live?.step_runs || [];
  const runStatus = live?.workflow_runs_by_pk?.status;
  const webhookTriggerDef = workflow.triggers?.find((t) => t.type === 'webhook');

  return (
    <div className="app-shell">
      <Topbar />
      <main className="main">
        <section className="hero">
          <h1>{workflow.name}</h1>
          <p>{workflow.description || 'Workflow detail and live execution.'}</p>
          <div className="row">
            <span className="badge mono">{workflow.id}</span>
            {runStatus && (
              <span className={`badge ${runStatus}`}>
                <span className="live-dot" /> {runStatus}
              </span>
            )}
          </div>
        </section>

        <div className="grid-2">
          <section className="panel">
            <h2>Definition</h2>
            {workflow.steps.map((step) => (
              <div key={step.id} className="step-row">
                <div className="step-index">{step.position + 1}</div>
                <div>
                  <div style={{ fontWeight: 600 }}>{step.name}</div>
                  <div className="muted mono" style={{ fontSize: '0.8rem' }}>
                    {step.type}
                  </div>
                </div>
                <span className="badge">{step.type}</span>
              </div>
            ))}
            <h3 style={{ marginTop: '1.25rem' }}>Triggers</h3>
            <div className="row">
              {workflow.triggers.map((t) => (
                <span key={t.id} className="badge">
                  {t.type}
                  {t.type === 'webhook' && t.secret ? ` · ${t.secret}` : ''}
                </span>
              ))}
            </div>
          </section>

          <section className="panel">
            <h2>Run</h2>
            {error && <div className="error">{error}</div>}
            <div className="field">
              <label>Lead / input text</label>
              <textarea value={lead} onChange={(e) => setLead(e.target.value)} />
            </div>
            <div className="row">
              {canRun && (
                <button className="btn btn-primary" type="button" disabled={busy} onClick={onRun}>
                  {busy ? 'Working…' : 'Run'}
                </button>
              )}
              {!canRun && <span className="badge">Viewers cannot trigger runs</span>}
              {canRun && webhookTriggerDef && (
                <button className="btn" type="button" disabled={busy} onClick={onWebhookTest}>
                  Start via webhook
                </button>
              )}
              {canRun && (
                <button className="btn" type="button" disabled={busy} onClick={onDbEvent}>
                  Fire DB event
                </button>
              )}
            </div>
            <p className="muted" style={{ marginTop: '0.85rem', fontSize: '0.85rem' }}>
              GraphQL endpoint for external webhook:{' '}
              <span className="mono">webhookTrigger</span> with workflow id + secret.
            </p>
          </section>
        </div>

        <section className="panel" style={{ marginTop: '1rem' }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 style={{ margin: 0 }}>Live step status</h2>
            {runId ? (
              <span className="badge running">
                <span className="live-dot" /> subscribed · {runId.slice(0, 8)}
              </span>
            ) : (
              <span className="badge">waiting for a run</span>
            )}
          </div>

          {stepRuns.length === 0 && (
            <p className="muted">Start a run to stream step_runs over GraphQL subscription.</p>
          )}

          {stepRuns.map((sr) => (
            <div key={sr.id} className="step-row">
              <div className="step-index">{sr.position + 1}</div>
              <div>
                <div style={{ fontWeight: 600 }}>
                  {sr.workflow_step?.name || `Step ${sr.position}`}
                </div>
                <div className="muted mono" style={{ fontSize: '0.8rem' }}>
                  {sr.workflow_step?.type} · attempts {sr.attempt_count}
                </div>
                {sr.output != null && (
                  <pre
                    className="mono"
                    style={{
                      whiteSpace: 'pre-wrap',
                      fontSize: '0.75rem',
                      color: 'var(--muted)',
                      margin: '0.4rem 0 0',
                    }}
                  >
                    {JSON.stringify(sr.output, null, 2)}
                  </pre>
                )}
                {sr.error && (
                  <div className="error" style={{ marginTop: '0.5rem' }}>
                    {sr.error}
                  </div>
                )}
              </div>
              <div className="row" style={{ flexDirection: 'column', alignItems: 'flex-end' }}>
                <span className={`badge ${sr.status}`}>{sr.status}</span>
                {sr.status === 'paused' && canRun && (
                  <button
                    className="btn btn-primary"
                    type="button"
                    disabled={busy}
                    onClick={() => onApprove(sr.id)}
                  >
                    Approve
                  </button>
                )}
              </div>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
