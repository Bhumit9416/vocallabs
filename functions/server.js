const http = require('http');
const triggerWorkflowRun = require('./trigger-workflow-run');
const approveStep = require('./approve-step');
const webhookTrigger = require('./webhook-trigger');
const notifyHandler = require('./notify-handler');
const scheduledTrigger = require('./scheduled-trigger');
const dbEventTrigger = require('./db-event-trigger');

const routes = {
  '/health': async (_req, res) => res.status(200).json({ ok: true }),
  '/trigger-workflow-run': triggerWorkflowRun,
  '/approve-step': approveStep,
  '/webhook-trigger': webhookTrigger,
  '/notify-handler': notifyHandler,
  '/scheduled-trigger': scheduledTrigger,
  '/db-event-trigger': dbEventTrigger,
};

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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const handler = routes[url.pathname];

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  if (!handler) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ message: 'Not found' }));
  }

  try {
    req.body = await readBody(req);
    const fakeRes = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        res.writeHead(this.statusCode || 200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(payload));
      },
    };
    await handler(req, fakeRes);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: err.message || String(err) }));
  }
});

const port = Number(process.env.PORT || 4001);
server.listen(port, () => {
  console.log(`functions listening on ${port}`);
});
