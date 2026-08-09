export type WorkflowTrigger = {
  id: string;
  type: string;
  is_active?: boolean;
  config?: Record<string, unknown>;
  secret?: string | null;
};

export type WorkflowStep = {
  id: string;
  position: number;
  type: string;
  name: string;
  config?: Record<string, unknown>;
};

export type WorkflowRunSummary = {
  id: string;
  status: string;
  trigger_type?: string;
  created_at?: string;
  completed_at?: string | null;
  error?: string | null;
};

export type WorkflowSummary = {
  id: string;
  name: string;
  description?: string | null;
  steps?: WorkflowStep[];
  triggers?: WorkflowTrigger[];
  runs?: WorkflowRunSummary[];
};

export type StepRun = {
  id: string;
  position: number;
  status: string;
  input?: unknown;
  output?: unknown;
  error?: string | null;
  attempt_count?: number;
  approved_by?: string | null;
  approved_at?: string | null;
  workflow_step?: {
    id: string;
    name: string;
    type: string;
  };
};

export type WorkflowDetail = {
  id: string;
  org_id: string;
  name: string;
  description?: string | null;
  is_active?: boolean;
  steps: WorkflowStep[];
  triggers: WorkflowTrigger[];
  runs?: WorkflowRunSummary[];
};
