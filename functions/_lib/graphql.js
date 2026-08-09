const ADMIN_SECRET =
  process.env.HASURA_GRAPHQL_ADMIN_SECRET ||
  process.env.NHOST_ADMIN_SECRET ||
  'local-admin-secret';

const GRAPHQL_URL =
  process.env.HASURA_GRAPHQL_URL ||
  process.env.NHOST_GRAPHQL_URL ||
  'http://localhost:1337/v1/graphql';

async function gql(query, variables = {}, headers = {}) {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hasura-admin-secret': ADMIN_SECRET,
      ...headers,
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await res.json();
  if (json.errors?.length) {
    const msg = json.errors.map((e) => e.message).join('; ');
    throw new Error(msg);
  }
  return json.data;
}

function getUserId(req) {
  return (
    req.headers['x-hasura-user-id'] ||
    req.headers['x-hasura-user-id'.toLowerCase()] ||
    null
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { gql, getUserId, sleep, GRAPHQL_URL, ADMIN_SECRET };
