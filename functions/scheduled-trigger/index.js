const { startWorkflowRun, gql } = require('../_lib/executor');

const LIST_SCHEDULED = `
  query ListScheduled {
    workflow_triggers(
      where: { type: { _eq: scheduled }, is_active: { _eq: true } }
    ) {
      id
      workflow_id
      config
    }
  }
`;

function dueNow(config) {
  if (!config) return false;
  if (config.every_minutes) {
    const minute = new Date().getUTCMinutes();
    return minute % Number(config.every_minutes) === 0;
  }
  if (config.cron === 'every_5m') return true;
  return Boolean(config.always);
}

module.exports = async (req, res) => {
  try {
    const data = await gql(LIST_SCHEDULED);
    const started = [];

    for (const trigger of data.workflow_triggers) {
      if (!dueNow(trigger.config)) continue;
      try {
        const result = await startWorkflowRun({
          workflowId: trigger.workflow_id,
          userId: null,
          triggerType: 'scheduled',
          input: { scheduled_at: new Date().toISOString() },
          skipAuth: true,
        });
        started.push(result);
      } catch (err) {
        started.push({ workflow_id: trigger.workflow_id, error: err.message });
      }
    }

    return res.status(200).json({ ok: true, started });
  } catch (err) {
    return res.status(500).json({ message: err.message || String(err) });
  }
};
