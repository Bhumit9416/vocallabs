'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { gql, useQuery } from '@apollo/client';
import { useAuth } from '@/lib/auth';
import { useOrg } from '@/lib/org';
import { ORG_WORKFLOWS_QUERY } from '@/lib/graphql';
import { Topbar } from '@/components/Topbar';
import type { WorkflowSummary } from '@/lib/types';

function statusBadge(status?: string) {
  if (!status) return <span className="badge">no runs</span>;
  const cls =
    status === 'completed'
      ? 'ok'
      : status === 'paused'
        ? 'paused'
        : status === 'failed'
          ? 'failed'
          : status === 'running'
            ? 'running'
            : '';
  return <span className={`badge ${cls}`}>{status}</span>;
}

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const { current, canEdit, loading: orgLoading } = useOrg();
  const router = useRouter();

  const { data, loading, refetch } = useQuery(gql(ORG_WORKFLOWS_QUERY), {
    variables: { orgId: current?.org_id },
    skip: !current?.org_id,
  });

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [authLoading, user, router]);

  useEffect(() => {
    if (current?.org_id) refetch();
  }, [current?.org_id, refetch]);

  if (authLoading || orgLoading || !user) {
    return (
      <div className="login-wrap">
        <div className="muted">Loading…</div>
      </div>
    );
  }

  const workflows: WorkflowSummary[] = data?.organizations_by_pk?.workflows || [];
  const usage = data?.org_usage_stats?.[0];

  return (
    <div className="app-shell">
      <Topbar />
      <main className="main">
        <section className="hero">
          <h1>{current?.organization.name || 'Your organization'}</h1>
          <p>
            Build multi-step AI agent workflows, trigger them manually or via webhook,
            and watch each step update live — including approval pauses.
          </p>
          <div className="row">
            {canEdit && (
              <Link className="btn btn-primary" href="/workflows/new">
                New workflow
              </Link>
            )}
            {usage && (
              <span className="badge">
                {usage.runs_this_month ?? 0} runs this month
                {usage.avg_run_duration_seconds != null
                  ? ` · avg ${Number(usage.avg_run_duration_seconds).toFixed(1)}s`
                  : ''}
              </span>
            )}
            <span className="badge">{current?.role}</span>
          </div>
        </section>

        <section className="panel">
          <h2>Workflows</h2>
          {loading && <p className="muted">Fetching workflows…</p>}
          {!loading && workflows.length === 0 && (
            <p className="muted">No workflows visible in this organization.</p>
          )}
          <div className="list">
            {workflows.map((wf) => {
              const latest = wf.runs?.[0];
              return (
                <Link key={wf.id} href={`/workflows/${wf.id}`} className="list-item">
                  <div>
                    <div style={{ fontWeight: 600 }}>{wf.name}</div>
                    <div className="muted" style={{ fontSize: '0.9rem', marginTop: 4 }}>
                      {wf.steps?.length || 0} steps ·{' '}
                      {wf.triggers?.map((t) => t.type).join(', ')}
                    </div>
                  </div>
                  <div className="row">
                    {statusBadge(latest?.status)}
                    <span className="muted mono" style={{ fontSize: '0.75rem' }}>
                      {wf.id.slice(0, 8)}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
