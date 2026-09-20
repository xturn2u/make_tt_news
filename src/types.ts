export type NodeStatus = 'idle' | 'running' | 'success' | 'warning' | 'error' | 'skipped';

export type SystemStatus = {
  platform: string;
  ffmpegAvailable: boolean;
  ffmpegPath: string | null;
  sayAvailable: boolean;
  ollamaAvailable: boolean;
  ollamaModels: string[];
  dataDir: string;
};

export type MediaResult = {
  title: string;
  thumbUrl: string;
  originalUrl: string;
  pageUrl: string;
  license: string;
  artist: string;
};

export type ReplicateResult = {
  id?: string;
  status?: string;
  output?: unknown;
  error?: unknown;
  [key: string]: unknown;
};

export type StudioNodeData = {
  title: string;
  subtitle: string;
  icon: string;
  status: NodeStatus;
  detail?: string;
};
