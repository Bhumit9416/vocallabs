const { startWorkflowRun, gql } = require('../_lib/executor');

const GET_TRIGGER = `
  query GetWebhookTrigger($workflow_id: uuid!) {
    workflow_triggers(
      where: {
        workflow_id: { _eq: $workflow_id }
        type: { _eq: webhook }
        is_active: { _eq: true }
      }
      limit: 1
    ) {
      id
      secret
      workflow_id
    }
  }
`;

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ message: 'Method not allowed' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const input = body.input || body;
    const workflowId = input.workflow_id;
    const secret = input.secret;
    const payload = input.payload || {};

    if (!workflowId || !secret) {
      return res.status(400).json({ message: 'workflow_id and secret are required' });
    }

    const data = await gql(GET_TRIGGER, { workflow_id: workflowId });
    const trigger = data.workflow_triggers[0];
    if (!trigger || trigger.secret !== secret) {
      return res.status(403).json({ message: 'Invalid webhook credentials' });
    }

    const result = await startWorkflowRun({
      workflowId,
      userId: null,
      triggerType: 'webhook',
      input: payload,
      skipAuth: true,
    });

    return res.status(200).json(result);
  } catch (err) {
    return res.status(400).json({ message: err.message || String(err) });
  }
};
