export const ORG_WORKFLOWS_QUERY = `
  query OrgWorkflows($orgId: uuid!) {
    organizations_by_pk(id: $orgId) {
      id
      name
      quota_limit
      quota_used
      workflows(order_by: { updated_at: desc }) {
        id
        name
        description
        is_active
        created_at
        steps(order_by: { position: asc }) {
          id
          position
          type
          name
          config
        }
        triggers {
          id
          type
          is_active
          config
        }
        runs(order_by: { created_at: desc }, limit: 1) {
          id
          status
          trigger_type
          created_at
          completed_at
        }
      }
    }
    org_usage_stats(where: { org_id: { _eq: $orgId } }) {
      org_id
      quota_limit
      quota_used
      runs_this_month
      avg_run_duration_seconds
    }
  }
`;

export const MY_ORGS_QUERY = `
  query MyOrgs {
    org_members {
      id
      role
      org_id
      organization {
        id
        name
        quota_limit
        quota_used
      }
    }
  }
`;

export const WORKFLOW_DETAIL_QUERY = `
  query WorkflowDetail($id: uuid!) {
    workflows_by_pk(id: $id) {
      id
      org_id
      name
      description
      is_active
      steps(order_by: { position: asc }) {
        id
        position
        type
        name
        config
      }
      triggers {
        id
        type
        is_active
        config
        secret
      }
      runs(order_by: { created_at: desc }, limit: 5) {
        id
        status
        trigger_type
        created_at
        error
      }
    }
  }
`;

export const STEP_RUNS_SUB = `
  subscription StepRuns($runId: uuid!) {
    step_runs(
      where: { workflow_run_id: { _eq: $runId } }
      order_by: { position: asc }
    ) {
      id
      position
      status
      input
      output
      error
      attempt_count
      approved_by
      approved_at
      workflow_step {
        id
        name
        type
      }
    }
    workflow_runs_by_pk(id: $runId) {
      id
      status
      error
      current_step_position
    }
  }
`;

export const TRIGGER_RUN = `
  mutation TriggerRun($workflowId: uuid!, $input: jsonb) {
    triggerWorkflowRun(workflow_id: $workflowId, input: $input) {
      run_id
      status
      message
    }
  }
`;

export const APPROVE_STEP = `
  mutation ApproveStep($stepRunId: uuid!) {
    approveStep(step_run_id: $stepRunId) {
      run_id
      status
      message
    }
  }
`;

export const CREATE_WORKFLOW = `
  mutation CreateWorkflow($object: workflows_insert_input!) {
    insert_workflows_one(object: $object) {
      id
    }
  }
`;

export const DELETE_STEPS = `
  mutation DeleteSteps($workflowId: uuid!) {
    delete_workflow_steps(where: { workflow_id: { _eq: $workflowId } }) {
      affected_rows
    }
  }
`;

export const INSERT_STEPS = `
  mutation InsertSteps($objects: [workflow_steps_insert_input!]!) {
    insert_workflow_steps(objects: $objects) {
      affected_rows
    }
  }
`;

export const UPDATE_WORKFLOW = `
  mutation UpdateWorkflow($id: uuid!, $set: workflows_set_input!) {
    update_workflows_by_pk(pk_columns: { id: $id }, _set: $set) {
      id
    }
  }
`;

export const UPSERT_TRIGGER = `
  mutation UpsertTrigger($object: workflow_triggers_insert_input!) {
    insert_workflow_triggers_one(
      object: $object
      on_conflict: {
        constraint: workflow_triggers_workflow_id_type_key
        update_columns: [config, is_active, secret]
      }
    ) {
      id
    }
  }
`;

export const INSERT_WATCHED_EVENT = `
  mutation InsertWatched($object: watched_events_insert_input!) {
    insert_watched_events_one(object: $object) {
      id
    }
  }
`;
