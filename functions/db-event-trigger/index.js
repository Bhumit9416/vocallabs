const { startWorkflowRun, gql } = require('../_lib/executor');

const FIND_TRIGGERS = `
  query FindDbTriggers($org_id: uuid!) {
    workflow_triggers(
      where: {
        type: { _eq: database_event }
        is_active: { _eq: true }
        workflow: { org_id: { _eq: $org_id } }
      }
    ) {
      id
      workflow_id
      config
    }
  }
`;

module.exports = async (req, res) => {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const row = body.event?.data?.new;
    if (!row) return res.status(200).json({ ok: true, skipped: true });

    const data = await gql(FIND_TRIGGERS, { org_id: row.org_id });
    const started = [];

    for (const trigger of data.workflow_triggers) {
      const matchType = trigger.config?.event_type;
      if (matchType && matchType !== row.event_type) continue;

      const result = await startWorkflowRun({
        workflowId: trigger.workflow_id,
        userId: null,
        triggerType: 'database_event',
        input: { watched_event: row },
        skipAuth: true,
      });
      started.push(result);
    }

    return res.status(200).json({ ok: true, started });
  } catch (err) {
    return res.status(500).json({ message: err.message || String(err) });
  }
};
