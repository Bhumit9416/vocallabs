'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { config } from './config';

export type AuthUser = {
  id: string;
  email: string;
  displayName?: string;
};

type AuthState = {
  user: AuthUser | null;
  accessToken: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  signOut: () => void;
};

const AuthContext = createContext<AuthState | null>(null);
const STORAGE_KEY = 'vocallabs_session';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setUser(parsed.user);
        setAccessToken(parsed.accessToken);
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    } finally {
      setLoading(false);
    }
  }, []);

  const persist = (session: { accessToken: string; user: AuthUser }) => {
    setUser(session.user);
    setAccessToken(session.accessToken);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  };

  const signIn = async (email: string, password: string) => {
    const res = await fetch(`${config.authUrl}/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Sign in failed');
    persist(json.session);
  };

  const signUp = async (email: string, password: string, displayName?: string) => {
    const res = await fetch(`${config.authUrl}/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, displayName }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Sign up failed');
    persist(json.session);
  };

  const signOut = () => {
    setUser(null);
    setAccessToken(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  const value = useMemo(
    () => ({ user, accessToken, loading, signIn, signUp, signOut }),
    [user, accessToken, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
