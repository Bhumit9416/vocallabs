module.exports = async (req, res) => {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const event = body.event || body;
    const row = event.data?.new || event;

    const message = row?.message || 'Workflow notification';
    const channel = row?.channel || 'slack';
    const slackUrl = process.env.SLACK_WEBHOOK_URL;

    if (slackUrl && channel === 'slack') {
      await fetch(slackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: message }),
      });
      return res.status(200).json({ ok: true, delivered: 'slack' });
    }

    console.log('[notify]', { channel, message, payload: row?.payload });
    return res.status(200).json({ ok: true, delivered: 'log', stubbed: !slackUrl });
  } catch (err) {
    return res.status(500).json({ message: err.message || String(err) });
  }
};
