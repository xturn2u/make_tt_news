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

export type NewsArticle = {
  url: string;
  title: string;
  text: string;
  siteName: string;
  wordCount: number;
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

export type NodeCategory = 'input' | 'agent' | 'media' | 'logic' | 'output';

export type NodeConfig = Record<string, string | number | boolean>;

export type StudioNodeData = Record<string, unknown> & {
  moduleId: string;
  title: string;
  subtitle: string;
  icon: string;
  category: NodeCategory;
  status: NodeStatus;
  detail?: string;
  config: NodeConfig;
  acceptsInput: boolean;
  providesOutput: boolean;
};
