export type ModuleStatus = 'idle' | 'running' | 'success' | 'error' | 'waiting';

export type WorkflowContext = {
  projectId: string;
  log: (message: string) => void;
};

export type WorkflowModule = {
  id: string;
  name: string;
  category: string;
  description: string;
  color: string;
  execute: (input: Record<string, unknown>, config: Record<string, unknown>, context: WorkflowContext) => Promise<Record<string, unknown>>;
};

export type WorkflowNodeData = {
  moduleId: string;
  label: string;
  description: string;
  category: string;
  status?: ModuleStatus;
  output?: Record<string, unknown>;
  config?: Record<string, unknown>;
};

export type RunLog = {
  nodeId: string;
  moduleId: string;
  status: ModuleStatus;
  message: string;
  output?: Record<string, unknown>;
};
