'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useOrg } from '@/lib/org';
import { Topbar } from '@/components/Topbar';
import { WorkflowBuilder } from '@/components/WorkflowBuilder';

export default function NewWorkflowPage() {
  const { user, loading } = useAuth();
  const { canEdit } = useOrg();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
    if (!loading && user && !canEdit) router.replace('/dashboard');
  }, [loading, user, canEdit, router]);

  return (
    <div className="app-shell">
      <Topbar />
      <main className="main">
        <section className="hero">
          <h1>New workflow</h1>
          <p>Chain agent steps, attach triggers, and keep owner-only gates in place.</p>
        </section>
        <WorkflowBuilder />
      </main>
    </div>
  );
}
