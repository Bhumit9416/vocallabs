const { approveAndResume } = require('../_lib/executor');
const { getUserId } = require('../_lib/graphql');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ message: 'Method not allowed' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const input = body.input || body;
    const stepRunId = input.step_run_id;
    const userId = getUserId(req) || body.session_variables?.['x-hasura-user-id'];

    if (!stepRunId) {
      return res.status(400).json({ message: 'step_run_id is required' });
    }

    const result = await approveAndResume({ stepRunId, userId });
    return res.status(200).json(result);
  } catch (err) {
    return res.status(400).json({ message: err.message || String(err) });
  }
};
