export type ModuleStatus = 'idle' | 'running' | 'success' | 'error' | 'waiting';

export type WorkflowContext = {
  projectId: string;
  log: (message: string) => void;
};

export type ModuleConfigFieldType = 'text' | 'url' | 'number' | 'textarea' | 'select' | 'boolean';

export type ModuleConfigField = {
  key: string;
  label: string;
  type: ModuleConfigFieldType;
  description?: string;
  placeholder?: string;
  required?: boolean;
  defaultValue?: string | number | boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ label: string; value: string }>;
};

export type ModuleDataField = {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  description?: string;
};

export type WorkflowModule = {
  id: string;
  name: string;
  category: string;
  description: string;
  color: string;
  version?: string;
  configFields?: ModuleConfigField[];
  inputs?: ModuleDataField[];
  outputs?: ModuleDataField[];
  execute: (
    input: Record<string, unknown>,
    config: Record<string, unknown>,
    context: WorkflowContext,
  ) => Promise<Record<string, unknown>>;
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
