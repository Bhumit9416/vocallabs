/* Apply Postgres schema from nhost migration (run once on fresh DB). */

const fs = require('fs');
const path = require('path');

const DATABASE_URL =
  process.env.DATABASE_URL ||
  process.env.HASURA_GRAPHQL_DATABASE_URL ||
  process.env.POSTGRES_URL;

if (!DATABASE_URL) {
  console.error('Set DATABASE_URL or HASURA_GRAPHQL_DATABASE_URL');
  process.exit(1);
}

async function main() {
  const { Client } = require('pg');
  const sqlPath = path.join(
    __dirname,
    '../nhost/migrations/default/1765400000000_init/up.sql'
  );
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('railway') ? { rejectUnauthorized: false } : undefined,
  });

  await client.connect();
  const check = await client.query(
    "SELECT to_regclass('public.organizations') AS exists"
  );
  if (check.rows[0]?.exists) {
    console.log('Schema already applied — skipping');
    await client.end();
    return;
  }

  console.log('Applying schema migration…');
  await client.query(sql);
  console.log('Schema applied');
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
