'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

export default function LoginPage() {
  const { signIn, signUp, user } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('owner.a@demo.local');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) {
    router.replace('/dashboard');
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'in') await signIn(email, password);
      else await signUp(email, password);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Auth failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="panel login-card">
        <div className="brand" style={{ marginBottom: '1.25rem' }}>
          Vocal<span>Labs</span>
        </div>
        <h1>{mode === 'in' ? 'Sign in' : 'Create account'}</h1>
        <p className="muted" style={{ marginTop: 0, marginBottom: '1.25rem' }}>
          Org-scoped AI agent workflows with live run status.
        </p>
        {error && <div className="error">{error}</div>}
        <form onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <div className="row" style={{ marginTop: '1rem' }}>
            <button className="btn btn-primary" disabled={busy} type="submit">
              {busy ? 'Please wait…' : mode === 'in' ? 'Sign in' : 'Sign up'}
            </button>
            <button
              className="btn"
              type="button"
              onClick={() => setMode(mode === 'in' ? 'up' : 'in')}
            >
              {mode === 'in' ? 'Need an account?' : 'Have an account?'}
            </button>
          </div>
        </form>
        <p className="muted mono" style={{ marginTop: '1.25rem', fontSize: '0.78rem' }}>
          Demo: owner.a@demo.local / owner.b@demo.local — password123
        </p>
      </div>
    </div>
  );
}
