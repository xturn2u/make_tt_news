import type { Edge, Node } from '@xyflow/react';
import type { StudioNodeData } from '../types';
import { createFlowNode } from './catalog';

export const DEFAULT_NODES: Node<StudioNodeData>[] = [
  createFlowNode('news-url', 'news-url-1', { x: 40, y: 220 }),
  createFlowNode('article-reader', 'article-reader-1', { x: 290, y: 220 }),
  createFlowNode('research-agent', 'research-agent-1', { x: 540, y: 220 }),
  createFlowNode('script-agent', 'script-agent-1', { x: 790, y: 220 }),
  createFlowNode('storyboard-agent', 'storyboard-agent-1', { x: 1040, y: 100 }),
  createFlowNode('asset-search', 'asset-search-1', { x: 1290, y: 80 }),
  createFlowNode('tts', 'tts-1', { x: 1040, y: 330 }),
  createFlowNode('captions', 'captions-1', { x: 1290, y: 330 }),
  createFlowNode('video-compose', 'video-compose-1', { x: 1540, y: 210 }),
  createFlowNode('qc-agent', 'qc-agent-1', { x: 1790, y: 210 }),
  createFlowNode('export', 'export-1', { x: 2040, y: 210 })
];

export const DEFAULT_EDGES: Edge[] = [
  { id: 'e-url-reader', source: 'news-url-1', target: 'article-reader-1', animated: true },
  { id: 'e-reader-research', source: 'article-reader-1', target: 'research-agent-1' },
  { id: 'e-research-script', source: 'research-agent-1', target: 'script-agent-1', animated: true },
  { id: 'e-script-story', source: 'script-agent-1', target: 'storyboard-agent-1' },
  { id: 'e-story-assets', source: 'storyboard-agent-1', target: 'asset-search-1' },
  { id: 'e-script-tts', source: 'script-agent-1', target: 'tts-1' },
  { id: 'e-script-captions', source: 'tts-1', target: 'captions-1' },
  { id: 'e-assets-compose', source: 'asset-search-1', target: 'video-compose-1' },
  { id: 'e-tts-compose', source: 'tts-1', target: 'video-compose-1' },
  { id: 'e-captions-compose', source: 'captions-1', target: 'video-compose-1' },
  { id: 'e-compose-qc', source: 'video-compose-1', target: 'qc-agent-1' },
  { id: 'e-qc-export', source: 'qc-agent-1', target: 'export-1', animated: true }
];
