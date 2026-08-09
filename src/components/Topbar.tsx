'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { useOrg } from '@/lib/org';

export function Topbar() {
  const { user, signOut } = useAuth();
  const { memberships, current, setOrgId } = useOrg();

  return (
    <header className="topbar">
      <Link href="/dashboard" className="brand">
        Vocal<span>Labs</span>
      </Link>
      <div className="row">
        {current && (
          <div className="quota">
            <div className="muted" style={{ fontSize: '0.75rem' }}>
              Quota this period
            </div>
            <div>
              <strong>{current.organization.quota_used}</strong>
              <span className="muted"> / {current.organization.quota_limit}</span>
            </div>
          </div>
        )}
        {memberships.length > 0 && (
          <select
            value={current?.org_id || ''}
            onChange={(e) => setOrgId(e.target.value)}
            style={{
              background: 'rgba(15,20,16,0.65)',
              color: 'var(--ink)',
              border: '1px solid var(--line)',
              borderRadius: 10,
              padding: '0.55rem 0.7rem',
            }}
          >
            {memberships.map((m) => (
              <option key={m.id} value={m.org_id}>
                {m.organization.name} ({m.role})
              </option>
            ))}
          </select>
        )}
        <span className="muted" style={{ fontSize: '0.9rem' }}>
          {user?.email}
        </span>
        <button className="btn" onClick={signOut} type="button">
          Sign out
        </button>
      </div>
    </header>
  );
}
