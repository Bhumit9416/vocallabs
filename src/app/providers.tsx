'use client';

import { AuthProvider } from '@/lib/auth';
import { ApolloWrapper } from '@/lib/apollo';
import { OrgProvider } from '@/lib/org';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ApolloWrapper>
        <OrgProvider>{children}</OrgProvider>
      </ApolloWrapper>
    </AuthProvider>
  );
}
