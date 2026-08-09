'use client';

import { ApolloClient, ApolloProvider, HttpLink, InMemoryCache, split } from '@apollo/client';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { getMainDefinition } from '@apollo/client/utilities';
import { setContext } from '@apollo/client/link/context';
import { createClient } from 'graphql-ws';
import { useMemo } from 'react';
import { config } from './config';
import { useAuth } from './auth';

export function ApolloWrapper({ children }: { children: React.ReactNode }) {
  const { accessToken } = useAuth();

  const client = useMemo(() => {
    const httpLink = new HttpLink({ uri: config.graphqlUrl });

    const authLink = setContext((_, { headers }) => ({
      headers: {
        ...headers,
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    }));

    const wsLink =
      typeof window !== 'undefined'
        ? new GraphQLWsLink(
            createClient({
              url: config.graphqlWsUrl,
              connectionParams: () => {
                if (!accessToken) return {};
                return {
                  headers: {
                    Authorization: `Bearer ${accessToken}`,
                  },
                };
              },
              retryAttempts: 5,
              shouldRetry: () => true,
            })
          )
        : null;

    const link =
      typeof window !== 'undefined' && wsLink
        ? split(
            ({ query }) => {
              const def = getMainDefinition(query);
              return def.kind === 'OperationDefinition' && def.operation === 'subscription';
            },
            wsLink,
            authLink.concat(httpLink)
          )
        : authLink.concat(httpLink);

    return new ApolloClient({
      link,
      cache: new InMemoryCache(),
      defaultOptions: {
        watchQuery: { fetchPolicy: 'network-only' },
        query: { fetchPolicy: 'network-only' },
      },
    });
  }, [accessToken]);

  return <ApolloProvider client={client}>{children}</ApolloProvider>;
}
