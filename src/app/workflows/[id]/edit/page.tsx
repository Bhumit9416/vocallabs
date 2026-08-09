'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { gql, useQuery } from '@apollo/client';
import { WORKFLOW_DETAIL_QUERY } from '@/lib/graphql';
import { useAuth } from '@/lib/auth';
import { useOrg } from '@/lib/org';
import { Topbar } from '@/components/Topbar';
import { WorkflowBuilder } from '@/components/WorkflowBuilder';
import type { WorkflowDetail } from '@/lib/types';

export default function EditWorkflowPage() {
  const params = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const { canEdit } = useOrg();
  const router = useRouter();

  const { data, loading, error } = useQuery(gql(WORKFLOW_DETAIL_QUERY), {
    variables: { id: params.id },
    skip: !user,
  });

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
    if (!authLoading && user && !canEdit) router.replace('/dashboard');
  }, [authLoading, user, canEdit, router]);

  const workflow = data?.workflows_by_pk as WorkflowDetail | null | undefined;

  if (authLoading || loading) {
    return (
      <div className="login-wrap">
        <div className="muted">Loading…</div>
      </div>
    );
  }

  if (error || !workflow) {
    return (
      <div className="app-shell">
        <Topbar />
        <main className="main">
          <div className="panel">
            <h2>Workflow not available</h2>
            <p className="muted">{error?.message || 'Cannot edit this workflow.'}</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Topbar />
      <main className="main">
        <section className="hero">
          <h1>Edit workflow</h1>
          <p>{workflow.name}</p>
        </section>
        <WorkflowBuilder
          initial={{
            id: workflow.id,
            name: workflow.name,
            description: workflow.description || '',
            steps: workflow.steps.map((s) => ({
              type: s.type,
              name: s.name,
              config: (s.config || {}) as Record<string, unknown>,
            })),
          }}
        />
      </main>
    </div>
  );
}
