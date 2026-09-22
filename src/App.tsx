import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addEdge,
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Node
} from '@xyflow/react';
import InspectorPanel from './components/InspectorPanel';
import NodeLibrary from './components/NodeLibrary';
import StudioNode from './components/StudioNode';
import {
  createTts,
  fetchNewsArticle,
  ollamaGenerate,
  renderVerticalVideo,
  revealInFinder,
  searchWikimedia,
  systemStatus
} from './desktop';
import { createFlowNode } from './flow/catalog';
import { DEFAULT_EDGES, DEFAULT_NODES } from './flow/defaultFlow';
import { createExecutionPlan, validateNewsFlow } from './flow/engine';
import type { MediaResult, NewsArticle, NodeConfig, NodeStatus, StudioNodeData, SystemStatus } from './types';

const nodeTypes = { studio: StudioNode };

type RunContext = {
  url?: string;
  article?: NewsArticle;
  research?: string;
  script?: string;
  assetQuery?: string;
  asset?: MediaResult;
  audioPath?: string;
  videoPath?: string;
};

export default function App() {
  return (
    <ReactFlowProvider>
      <Studio />
    </ReactFlowProvider>
  );
}

function Studio() {
  const [nodes, setNodes, onNodesChange] = useNodesState(DEFAULT_NODES);
  const [edges, setEdges, onEdgesChange] = useEdgesState(DEFAULT_EDGES);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>('news-url-1');
  const [health, setHealth] = useState<SystemStatus | null>(null);
  const [model, setModel] = useState('');
  const [running, setRunning] = useState(false);
  const [outputPath, setOutputPath] = useState('');
  const [logs, setLogs] = useState<string[]>(['ContentFlow Studio bereit.']);
  const { screenToFlowPosition } = useReactFlow();

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId]
  );

  const sourceNode = useMemo(
    () => nodes.find((node) => node.data.moduleId === 'news-url') ?? null,
    [nodes]
  );

  const sourceUrl = sourceNode ? String(sourceNode.data.config.url ?? '') : '';

  const addLog = useCallback((message: string) => {
    setLogs((current) => [`${new Date().toLocaleTimeString('de-DE')} · ${message}`, ...current].slice(0, 80));
  }, []);

  const setNodeStatus = useCallback((nodeId: string, status: NodeStatus, detail?: string) => {
    setNodes((current) => current.map((node) =>
      node.id === nodeId
        ? { ...node, data: { ...node.data, status, detail } }
        : node
    ));
  }, [setNodes]);

  const updateNodeConfig = useCallback((nodeId: string, config: NodeConfig) => {
    setNodes((current) => current.map((node) =>
      node.id === nodeId
        ? { ...node, data: { ...node.data, config } }
        : node
    ));
  }, [setNodes]);

  const refreshHealth = useCallback(async () => {
    try {
      const status = await systemStatus();
      setHealth(status);
      setModel((current) => current || status.ollamaModels[0] || '');
      addLog(`Systemcheck: Ollama ${status.ollamaAvailable ? 'OK' : 'aus'}, FFmpeg ${status.ffmpegAvailable ? 'OK' : 'fehlt'}, TTS ${status.sayAvailable ? 'OK' : 'fehlt'}.`);
    } catch (error) {
      addLog(`Systemcheck fehlgeschlagen: ${errorText(error)}`);
    }
  }, [addLog]);

  useEffect(() => {
    void refreshHealth();
  }, [refreshHealth]);

  const setSourceUrl = useCallback((url: string) => {
    if (!sourceNode) return;
    updateNodeConfig(sourceNode.id, { ...sourceNode.data.config, url });
  }, [sourceNode, updateNodeConfig]);

  const addModule = useCallback((moduleId: string, position?: { x: number; y: number }) => {
    const id = `${moduleId}-${crypto.randomUUID().slice(0, 8)}`;
    const fallback = { x: 420 + (nodes.length % 4) * 55, y: 160 + (nodes.length % 5) * 75 };
    const node = createFlowNode(moduleId, id, position ?? fallback);
    setNodes((current) => [...current, node]);
    setSelectedNodeId(id);
    addLog(`${node.data.title} zum Flow hinzugefügt.`);
  }, [addLog, nodes.length, setNodes]);

  const deleteNode = useCallback((nodeId: string) => {
    setNodes((current) => current.filter((node) => node.id !== nodeId));
    setEdges((current) => current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
    setSelectedNodeId((current) => current === nodeId ? null : current);
  }, [setEdges, setNodes]);

  const onConnect = useCallback((connection: Connection) => {
    setEdges((current) => addEdge({ ...connection, animated: false }, current));
  }, [setEdges]);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const moduleId = event.dataTransfer.getData('application/x-contentflow-node');
    if (!moduleId) return;
    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    addModule(moduleId, position);
  }, [addModule, screenToFlowPosition]);

  const runFlow = useCallback(async () => {
    if (running) return;

    const warnings = validateNewsFlow(nodes, edges);
    if (warnings.length) {
      warnings.forEach(addLog);
      return;
    }

    let plan;
    try {
      plan = createExecutionPlan(nodes, edges);
    } catch (error) {
      addLog(errorText(error));
      return;
    }

    setRunning(true);
    setOutputPath('');
    setNodes((current) => current.map((node) => ({ ...node, data: { ...node.data, status: 'idle' as NodeStatus, detail: undefined } })));
    addLog(`Flow gestartet: ${plan.order.length} Module.`);

    const ctx: RunContext = {};

    try {
      for (const nodeId of plan.order) {
        const node = nodes.find((item) => item.id === nodeId);
        if (!node) continue;

        setNodeStatus(node.id, 'running', 'Wird ausgeführt …');
        const moduleId = node.data.moduleId;
        const config = node.data.config;

        if (moduleId === 'news-url') {
          const url = String(config.url ?? '').trim();
          if (!url) throw new Error('Im News-URL-Node fehlt der Nachrichten-Link.');
          ctx.url = url;
          setNodeStatus(node.id, 'success', new URL(url).hostname);
          continue;
        }

        if (moduleId === 'article-reader') {
          if (!ctx.url) throw new Error('Artikel laden benötigt eine News URL.');
          ctx.article = await fetchNewsArticle(ctx.url);
          setNodeStatus(node.id, 'success', `${ctx.article.wordCount} Wörter · ${ctx.article.siteName}`);
          addLog(`Artikel geladen: ${ctx.article.title}`);
          continue;
        }

        if (moduleId === 'research-agent') {
          if (!ctx.article) throw new Error('Research Agent benötigt einen geladenen Artikel.');
          const instruction = String(config.prompt ?? '');
          if (health?.ollamaAvailable && model) {
            ctx.research = await ollamaGenerate(model, buildResearchPrompt(ctx.article, instruction));
            setNodeStatus(node.id, 'success', model);
          } else {
            ctx.research = ctx.article.text;
            setNodeStatus(node.id, 'warning', 'Lokale KI nicht aktiv · Quelltext weitergegeben');
          }
          continue;
        }

        if (moduleId === 'script-agent') {
          if (!ctx.article) throw new Error('Script Agent benötigt Artikeldaten.');
          const duration = Number(config.duration ?? 55);
          if (health?.ollamaAvailable && model) {
            ctx.script = await ollamaGenerate(model, buildScriptPrompt(ctx.article, ctx.research ?? ctx.article.text, duration, String(config.style ?? 'seriös')));
            setNodeStatus(node.id, 'success', `${model} · ~${duration}s`);
          } else {
            ctx.script = fallbackScript(ctx.article, duration);
            setNodeStatus(node.id, 'warning', 'Fallback ohne generative KI');
          }
          addLog('Sprechertext erzeugt.');
          continue;
        }

        if (moduleId === 'storyboard-agent') {
          if (!ctx.article) throw new Error('Storyboard Agent benötigt Artikeldaten.');
          if (health?.ollamaAvailable && model) {
            const response = await ollamaGenerate(model, buildStoryboardPrompt(ctx.article, ctx.script ?? '', Number(config.scenes ?? 6)));
            ctx.assetQuery = normalizeSearchQuery(response) || deriveQuery(ctx.article);
            setNodeStatus(node.id, 'success', ctx.assetQuery);
          } else {
            ctx.assetQuery = deriveQuery(ctx.article);
            setNodeStatus(node.id, 'warning', ctx.assetQuery);
          }
          continue;
        }

        if (moduleId === 'asset-search') {
          if (!ctx.article) throw new Error('Asset Search benötigt Artikeldaten.');
          const query = String(config.query ?? '').trim() || ctx.assetQuery || deriveQuery(ctx.article);
          const results = await searchWikimedia(query, Number(config.limit ?? 8));
          if (!results.length) throw new Error(`Keine Medien für „${query}“ gefunden.`);
          ctx.asset = results[0];
          setNodeStatus(node.id, 'success', `${results.length} Treffer · ${ctx.asset.license}`);
          addLog(`Asset Search: ${results.length} Treffer für „${query}“.`);
          continue;
        }

        if (moduleId === 'tts') {
          if (!ctx.script) throw new Error('TTS benötigt einen Sprechertext.');
          ctx.audioPath = await createTts(ctx.script, String(config.voice ?? ''));
          setNodeStatus(node.id, 'success', 'Lokale Audiodatei erstellt');
          continue;
        }

        if (moduleId === 'captions') {
          setNodeStatus(node.id, 'skipped', 'Caption-Renderer folgt in V1.1');
          continue;
        }

        if (moduleId === 'video-compose') {
          if (!ctx.asset || !ctx.audioPath) throw new Error('Video Composer benötigt Asset und TTS-Audio.');
          if (!health?.ffmpegAvailable) throw new Error('FFmpeg fehlt auf diesem Mac.');
          ctx.videoPath = await renderVerticalVideo(ctx.asset.originalUrl, ctx.audioPath);
          setNodeStatus(node.id, 'success', '1080 × 1920 MP4');
          addLog('Video lokal gerendert.');
          continue;
        }

        if (moduleId === 'qc-agent') {
          if (!ctx.videoPath) throw new Error('QC Agent benötigt ein gerendertes Video.');
          setNodeStatus(node.id, 'success', 'Basisprüfung bestanden');
          continue;
        }

        if (moduleId === 'router') {
          setNodeStatus(node.id, 'skipped', 'Logic Runtime folgt in V1.1');
          continue;
        }

        if (moduleId === 'export') {
          if (!ctx.videoPath) throw new Error('Export benötigt ein gerendertes Video.');
          setOutputPath(ctx.videoPath);
          setNodeStatus(node.id, 'success', ctx.videoPath.split('/').pop() ?? 'MP4');
          continue;
        }

        setNodeStatus(node.id, 'skipped', 'Noch keine Runtime');
      }

      addLog('Flow erfolgreich abgeschlossen.');
    } catch (error) {
      const message = errorText(error);
      const activeId = plan.order.find((id) => nodes.find((node) => node.id === id)?.data.status === 'running');
      if (activeId) setNodeStatus(activeId, 'error', message);
      addLog(`Flow gestoppt: ${message}`);
    } finally {
      setRunning(false);
    }
  }, [addLog, edges, health, model, nodes, running, setNodeStatus, setNodes]);

  const badges = useMemo(() => [
    { label: 'Local AI', ok: !!health?.ollamaAvailable },
    { label: 'FFmpeg', ok: !!health?.ffmpegAvailable },
    { label: 'TTS', ok: !!health?.sayAvailable }
  ], [health]);

  return (
    <div className="studio-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">CF</div>
          <div>
            <strong>ContentFlow Studio</strong>
            <span>TikTok News · Local AI · macOS</span>
          </div>
        </div>

        <div className="quick-source">
          <span>NEWS URL</span>
          <input
            value={sourceUrl}
            onChange={(event) => setSourceUrl(event.target.value)}
            placeholder="https://news.example.com/artikel"
          />
        </div>

        <div className="system-badges">
          {badges.map((badge) => (
            <span className={`health ${badge.ok ? 'ok' : 'off'}`} key={badge.label}>
              <i />{badge.label}
            </span>
          ))}
        </div>

        <button className="button ghost" onClick={() => void refreshHealth()}>System</button>
        <button className="button primary" disabled={running} onClick={() => void runFlow()}>
          {running ? 'Flow läuft …' : '▶ Flow starten'}
        </button>
      </header>

      <NodeLibrary onAdd={addModule} />

      <main className="flow-workspace">
        <div className="canvas-head">
          <div>
            <p className="eyebrow">WORKFLOW</p>
            <strong>News → TikTok Video</strong>
          </div>
          <div className="model-select">
            <span>Lokales Modell</span>
            <select value={model} onChange={(event) => setModel(event.target.value)}>
              <option value="">Kein Modell</option>
              {health?.ollamaModels.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
        </div>

        <div
          className="flow-canvas"
          onDrop={onDrop}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
          }}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            onPaneClick={() => setSelectedNodeId(null)}
            fitView
            minZoom={0.3}
            maxZoom={1.8}
            deleteKeyCode={['Backspace', 'Delete']}
          >
            <Background gap={28} size={1} />
            <MiniMap pannable zoomable nodeStrokeWidth={2} />
            <Controls />
          </ReactFlow>
        </div>

        <div className="run-dock">
          <div className="log-list">
            {logs.slice(0, 4).map((entry, index) => <span key={`${entry}-${index}`}>{entry}</span>)}
          </div>
          {outputPath && (
            <div className="output-ready">
              <div><strong>MP4 fertig</strong><small>{outputPath.split('/').pop()}</small></div>
              <button onClick={() => void revealInFinder(outputPath)}>Im Finder zeigen</button>
            </div>
          )}
        </div>
      </main>

      <InspectorPanel
        node={selectedNode as Node<StudioNodeData> | null}
        health={health}
        onChangeConfig={updateNodeConfig}
        onDelete={deleteNode}
      />
    </div>
  );
}

function buildResearchPrompt(article: NewsArticle, instruction: string) {
  return `Du bist Research-Agent für ein deutsches Nachrichtenstudio.
Arbeite ausschließlich mit dem folgenden Quelltext. Erfinde nichts.
${instruction}

TITEL: ${article.title}
QUELLE: ${article.siteName}

ARTIKEL:
${article.text}

Liefere kompakt:
- bestätigte Kernaussagen
- Namen, Orte, Zahlen und Daten
- Punkte, die im Artikel unklar oder nicht belegt sind
Keine Einleitung, keine Meinung.`;
}

function buildScriptPrompt(article: NewsArticle, research: string, duration: number, style: string) {
  return `Erstelle aus den folgenden belegten Informationen einen deutschen TikTok-News-Sprechertext.
Ziellänge: etwa ${duration} Sekunden.
Stil: ${style}.
Beginne mit einem klaren Hook, danach Ereignis, Bedeutung und Kontext.
Keine erfundenen Fakten. Keine Quellen vortäuschen. Keine Regieanweisungen.

TITEL: ${article.title}
RESEARCH:
${research}

Gib ausschließlich den fertigen Sprechertext aus.`;
}

function buildStoryboardPrompt(article: NewsArticle, script: string, scenes: number) {
  return `Du planst visuelle Assets für ein News-Video.
Artikel: ${article.title}
Sprechertext: ${script}
Geplant sind ${scenes} Szenen.
Gib als erste Zeile genau EINEN kurzen englischen oder deutschen Suchbegriff für Wikimedia Commons aus, der das zentrale reale Ereignis, den Ort oder die Organisation visuell am besten abbildet. Keine Anführungszeichen, keine Erklärung in der ersten Zeile.`;
}

function fallbackScript(article: NewsArticle, duration: number) {
  const maxWords = Math.max(80, Math.round(duration * 2.25));
  const words = article.text.split(/\s+/).filter(Boolean).slice(0, maxWords);
  return `${article.title}. ${words.join(' ')}`;
}

function deriveQuery(article: NewsArticle) {
  return article.title
    .replace(/[|–—:].*$/, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 7)
    .join(' ');
}

function normalizeSearchQuery(value: string) {
  return value
    .split('\n')[0]
    .replace(/^[-*"'\s]+|[-*"'\s]+$/g, '')
    .slice(0, 120)
    .trim();
}

function errorText(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}
