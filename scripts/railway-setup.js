/* Load .env.railway and run migrate + bootstrap */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const envFile = path.join(__dirname, '../.env.railway');
if (!fs.existsSync(envFile)) {
  console.error('Create .env.railway from .env.railway.example first');
  process.exit(1);
}

const lines = fs.readFileSync(envFile, 'utf8').split('\n');
for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq === -1) continue;
  const key = trimmed.slice(0, eq).trim();
  const val = trimmed.slice(eq + 1).trim();
  if (key && !process.env[key]) process.env[key] = val;
}

function run(script) {
  const r = spawnSync('node', [path.join(__dirname, script)], {
    stdio: 'inherit',
    env: process.env,
  });
  if (r.status !== 0) process.exit(r.status || 1);
}

console.log('Applying schema…');
run('migrate.js');
console.log('Applying Hasura metadata + seed…');
run('bootstrap.js');
console.log('Railway setup complete.');
console.log('Test webhook: npm run test:webhook');
