const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'local-jwt-secret-key-at-least-32-chars!!';
const GRAPHQL_URL = process.env.HASURA_GRAPHQL_URL || 'http://localhost:8080/v1/graphql';
const ADMIN_SECRET = process.env.HASURA_GRAPHQL_ADMIN_SECRET || 'local-admin-secret';
const PORT = Number(process.env.PORT || 4002);
const STORE = process.env.USER_STORE || path.join(__dirname, 'data', 'users.json');

function loadUsers() {
  try {
    const raw = fs.readFileSync(STORE, 'utf8');
    return new Map(Object.entries(JSON.parse(raw)));
  } catch {
    return new Map();
  }
}

function saveUsers() {
  fs.mkdirSync(path.dirname(STORE), { recursive: true });
  const obj = Object.fromEntries(users.entries());
  fs.writeFileSync(STORE, JSON.stringify(obj, null, 2));
}

const users = loadUsers();

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

async function gql(query, variables = {}) {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hasura-admin-secret': ADMIN_SECRET,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join('; '));
  return json.data;
}

function issueToken(user) {
  const claims = {
    sub: user.id,
    email: user.email,
    'https://hasura.io/jwt/claims': {
      'x-hasura-default-role': 'user',
      'x-hasura-allowed-roles': ['user'],
      'x-hasura-user-id': user.id,
    },
  };
  return jwt.sign(claims, JWT_SECRET, { algorithm: 'HS256', expiresIn: '7d' });
}

function send(res, code, payload) {
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  });
  res.end(JSON.stringify(payload));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'OPTIONS') {
    return send(res, 204, {});
  }

  try {
    if (req.method === 'GET' && url.pathname === '/health') {
      return send(res, 200, { ok: true });
    }

    if (req.method === 'POST' && url.pathname === '/signup') {
      const body = await readBody(req);
      const email = String(body.email || '').toLowerCase().trim();
      const password = String(body.password || '');
      const displayName = body.displayName || email.split('@')[0];

      if (!email || password.length < 8) {
        return send(res, 400, { message: 'Email and password (8+) required' });
      }
      if ([...users.values()].some((u) => u.email === email)) {
        return send(res, 400, { message: 'User already exists' });
      }

      const user = {
        id: crypto.randomUUID(),
        email,
        password,
        displayName,
      };
      users.set(user.id, user);
      saveUsers();
      const accessToken = issueToken(user);
      return send(res, 200, {
        session: {
          accessToken,
          user: { id: user.id, email: user.email, displayName: user.displayName },
        },
      });
    }

    if (req.method === 'POST' && url.pathname === '/signin') {
      const body = await readBody(req);
      const email = String(body.email || '').toLowerCase().trim();
      const password = String(body.password || '');
      const user = [...users.values()].find((u) => u.email === email && u.password === password);
      if (!user) return send(res, 401, { message: 'Invalid credentials' });
      const accessToken = issueToken(user);
      return send(res, 200, {
        session: {
          accessToken,
          user: { id: user.id, email: user.email, displayName: user.displayName },
        },
      });
    }

    if (req.method === 'GET' && url.pathname === '/me') {
      const auth = req.headers.authorization || '';
      const token = auth.replace(/^Bearer\s+/i, '');
      if (!token) return send(res, 401, { message: 'Missing token' });
      const payload = jwt.verify(token, JWT_SECRET);
      const user = users.get(payload.sub);
      if (!user) return send(res, 401, { message: 'Unknown user' });
      return send(res, 200, {
        user: { id: user.id, email: user.email, displayName: user.displayName },
      });
    }

    if (req.method === 'POST' && url.pathname === '/seed-membership') {
      const body = await readBody(req);
      await gql(
        `mutation SeedMember($object: org_members_insert_input!) {
          insert_org_members_one(object: $object) { id }
        }`,
        { object: body }
      );
      return send(res, 200, { ok: true });
    }

    return send(res, 404, { message: 'Not found' });
  } catch (err) {
    return send(res, 500, { message: err.message || String(err) });
  }
});

server.listen(PORT, () => {
  console.log(`auth-stub listening on ${PORT}`);
});
