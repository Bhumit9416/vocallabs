export const config = {
  graphqlUrl: process.env.NEXT_PUBLIC_GRAPHQL_URL || 'http://localhost:8080/v1/graphql',
  graphqlWsUrl:
    process.env.NEXT_PUBLIC_GRAPHQL_WS_URL || 'ws://localhost:8080/v1/graphql',
  authUrl: process.env.NEXT_PUBLIC_AUTH_URL || 'http://localhost:4002',
  nhostSubdomain: process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN || '',
  nhostRegion: process.env.NEXT_PUBLIC_NHOST_REGION || '',
  authMode: (process.env.NEXT_PUBLIC_AUTH_MODE || 'local') as 'local' | 'nhost',
};
