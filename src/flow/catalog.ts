import type { Node, XYPosition } from '@xyflow/react';
import type { NodeCategory, NodeConfig, StudioNodeData } from '../types';

export type NodeDefinition = {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  category: NodeCategory;
  acceptsInput: boolean;
  providesOutput: boolean;
  defaultConfig: NodeConfig;
};

export const NODE_CATALOG: NodeDefinition[] = [
  { id: 'news-url', title: 'News URL', subtitle: 'Nachrichten-Link', icon: '🌐', category: 'input', acceptsInput: false, providesOutput: true, defaultConfig: { url: '' } },
  { id: 'article-reader', title: 'Artikel laden', subtitle: 'HTML → sauberer Text', icon: '📰', category: 'media', acceptsInput: true, providesOutput: true, defaultConfig: {} },
  { id: 'research-agent', title: 'Research Agent', subtitle: 'Fakten & Kernaussagen', icon: '⌕', category: 'agent', acceptsInput: true, providesOutput: true, defaultConfig: { prompt: 'Extrahiere ausschließlich belegbare Fakten, Namen, Orte, Zahlen und offene Unsicherheiten.' } },
  { id: 'script-agent', title: 'Script Agent', subtitle: 'TikTok-Sprechertext', icon: '✦', category: 'agent', acceptsInput: true, providesOutput: true, defaultConfig: { duration: 55, style: 'seriös, klar, schnell', versions: 3 } },
  { id: 'custom-agent', title: 'Freier Agent', subtitle: 'Eigener Prompt', icon: '✎', category: 'agent', acceptsInput: true, providesOutput: true, defaultConfig: { name: 'Mein Agent', prompt: 'Bearbeite die Eingabe nach meinen Regeln.' } },
  { id: 'storyboard-agent', title: 'Storyboard Agent', subtitle: 'Szenen & Suchbegriffe', icon: '▦', category: 'agent', acceptsInput: true, providesOutput: true, defaultConfig: { scenes: 6 } },
  { id: 'asset-search', title: 'Asset Search', subtitle: 'Wikimedia & Quellen', icon: '◫', category: 'media', acceptsInput: true, providesOutput: true, defaultConfig: { query: '', limit: 8 } },
  { id: 'memory-card', title: 'Memory Card', subtitle: 'Assets & Material sammeln', icon: '▧', category: 'media', acceptsInput: true, providesOutput: true, defaultConfig: { name: 'Artikel-Material', source: 'asset-search' } },
  { id: 'tts', title: 'Local TTS', subtitle: 'Sprecher lokal', icon: '◖', category: 'media', acceptsInput: true, providesOutput: true, defaultConfig: { voice: '', rate: 1 } },
  { id: 'captions', title: 'Captions', subtitle: 'Untertitel-Layout', icon: 'CC', category: 'media', acceptsInput: true, providesOutput: true, defaultConfig: { style: 'news-bold', timing: 'tts-audio', wordsPerLine: 4 } },
  { id: 'video-compose', title: 'Video Composer', subtitle: 'FFmpeg · 9:16', icon: '▶', category: 'media', acceptsInput: true, providesOutput: true, defaultConfig: { width: 1080, height: 1920 } },
  { id: 'qc-agent', title: 'QC Agent', subtitle: 'Qualitätskontrolle', icon: '✓', category: 'agent', acceptsInput: true, providesOutput: true, defaultConfig: { strict: true } },
  { id: 'router', title: 'Router', subtitle: 'Bedingung / Verzweigung', icon: '↗', category: 'logic', acceptsInput: true, providesOutput: true, defaultConfig: { condition: '' } },
  { id: 'export', title: 'Export', subtitle: 'Lokale MP4', icon: '⇩', category: 'output', acceptsInput: true, providesOutput: false, defaultConfig: { filename: 'tiktok-news' } }
];

export const CATEGORIES: Array<{ id: NodeCategory; label: string }> = [
  { id: 'input', label: 'INPUT' },
  { id: 'agent', label: 'AI AGENTS' },
  { id: 'media', label: 'MEDIA' },
  { id: 'logic', label: 'LOGIC' },
  { id: 'output', label: 'OUTPUT' }
];

export function definitionFor(moduleId: string): NodeDefinition {
  const definition = NODE_CATALOG.find((item) => item.id === moduleId);
  if (!definition) throw new Error(`Unbekanntes Modul: ${moduleId}`);
  return definition;
}

export function createFlowNode(moduleId: string, id: string, position: XYPosition, config: NodeConfig = {}): Node<StudioNodeData> {
  const def = definitionFor(moduleId);
  return {
    id,
    type: 'studio',
    position,
    data: {
      moduleId: def.id,
      title: def.title,
      subtitle: def.subtitle,
      icon: def.icon,
      category: def.category,
      status: 'idle',
      config: { ...def.defaultConfig, ...config },
      acceptsInput: def.acceptsInput,
      providesOutput: def.providesOutput
    }
  };
}
