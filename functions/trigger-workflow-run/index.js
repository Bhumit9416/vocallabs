const { startWorkflowRun } = require('../_lib/executor');
const { getUserId } = require('../_lib/graphql');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ message: 'Method not allowed' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const input = body.input || body;
    const workflowId = input.workflow_id;
    const runInput = input.input || {};
    const userId = getUserId(req) || body.session_variables?.['x-hasura-user-id'];

    if (!workflowId) {
      return res.status(400).json({ message: 'workflow_id is required' });
    }

    const result = await startWorkflowRun({
      workflowId,
      userId,
      triggerType: 'manual',
      input: runInput,
    });

    return res.status(200).json(result);
  } catch (err) {
    return res.status(400).json({ message: err.message || String(err) });
  }
};
