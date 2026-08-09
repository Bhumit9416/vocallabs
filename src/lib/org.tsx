'use client';

import { useQuery } from '@apollo/client';
import { gql } from '@apollo/client';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { MY_ORGS_QUERY } from './graphql';
import { useAuth } from './auth';

type OrgMembership = {
  id: string;
  role: 'owner' | 'editor' | 'viewer';
  org_id: string;
  organization: {
    id: string;
    name: string;
    quota_limit: number;
    quota_used: number;
  };
};

type OrgState = {
  memberships: OrgMembership[];
  current: OrgMembership | null;
  setOrgId: (id: string) => void;
  loading: boolean;
  canEdit: boolean;
  canRun: boolean;
  isOwner: boolean;
};

const OrgContext = createContext<OrgState | null>(null);

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const { accessToken } = useAuth();
  const { data, loading } = useQuery(gql(MY_ORGS_QUERY), { skip: !accessToken });
  const [orgId, setOrgId] = useState<string | null>(null);

  const memberships: OrgMembership[] = data?.org_members || [];

  useEffect(() => {
    if (!orgId && memberships[0]) setOrgId(memberships[0].org_id);
  }, [memberships, orgId]);

  const current = memberships.find((m) => m.org_id === orgId) || null;
  const role = current?.role;
  const value = useMemo(
    () => ({
      memberships,
      current,
      setOrgId: (id: string) => setOrgId(id),
      loading,
      canEdit: role === 'owner' || role === 'editor',
      canRun: role === 'owner' || role === 'editor',
      isOwner: role === 'owner',
    }),
    [memberships, current, loading, role]
  );

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error('useOrg must be used within OrgProvider');
  return ctx;
}
