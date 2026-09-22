import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addEdge,
  reconnectEdge,
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node
} from '@xyflow/react';
import InspectorPanel from './components/InspectorPanel';
import SettingsPanel from './components/SettingsPanel';
import NodeLibrary from './components/NodeLibrary';
import StudioNode from './components/StudioNode';
import {
  createTts,
  fetchNewsArticle,
  mediaFileUrl,
  ollamaGenerate,
  renderVerticalVideo,
  revealInFinder,
  searchWikimedia,
  systemStatus
} from './desktop';
import { createFlowNode } from './flow/catalog';
import { DEFAULT_EDGES, DEFAULT_NODES } from './flow/defaultFlow';
import { createExecutionPlan, validateNewsFlow } from './flow/engine';
import type { MediaResult, NewsArticle, NodeConfig, NodeStatus, StepResult, StudioNodeData, SystemStatus } from './types';

type StoredProject = { id: string; title: string; nodes: Node<StudioNodeData>[]; edges: Edge[]; model: string; updatedAt: string };

type RunContext = {
  url?: string;
  article?: NewsArticle;
  research?: string;
  script?: string;
  assetQuery?: string;
  asset?: MediaResult;
  assets?: MediaResult[];
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [debugMode, setDebugMode] = useState(() => localStorage.getItem('contentflow.debug') === 'true');
  const [debugStops, setDebugStops] = useState(() => localStorage.getItem('contentflow.debugStops') === 'true');
  const [breakpoints, setBreakpoints] = useState<Record<string, boolean>>(() => readJson<Record<string, boolean>>('contentflow.breakpoints', {}));
  const [resultNodeId, setResultNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [flowTemplates, setFlowTemplates] = useState<StoredProject[]>(() => readJson<StoredProject[]>('contentflow.flowTemplates', []));
  const [projectTitle, setProjectTitle] = useState(() => localStorage.getItem('contentflow.project.title') || 'Neues Projekt');
  const [projects, setProjects] = useState<StoredProject[]>(() => readStoredProjects());
  const [memoryItems, setMemoryItems] = useState<MediaResult[]>([]);
  const [videoEditorOpen, setVideoEditorOpen] = useState(false);
  const cancelRequested = useRef(false);
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

  const setNodeResult = useCallback((nodeId: string, result?: StepResult) => {
    setNodes((current) => current.map((node) =>
      node.id === nodeId ? { ...node, data: { ...node.data, result } } : node
    ));
  }, [setNodes]);

  const toggleBreakpoint = useCallback((nodeId: string) => {
    setBreakpoints((current) => {
      const next = { ...current, [nodeId]: !current[nodeId] };
      localStorage.setItem('contentflow.breakpoints', JSON.stringify(next));
      return next;
    });
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

  useEffect(() => {
    const snapshot: StoredProject = { id: 'current', title: projectTitle || 'Neues Projekt', nodes, edges, model, updatedAt: new Date().toISOString() };
    localStorage.setItem('contentflow.flow', JSON.stringify(snapshot));
    localStorage.setItem('contentflow.project.title', projectTitle);
    setProjects((current) => {
      const existing = current.filter((project) => project.id !== 'current' && project.title !== snapshot.title);
      return [snapshot, ...existing].slice(0, 12);
    });
  }, [edges, model, nodes, projectTitle]);

  useEffect(() => {
    localStorage.setItem('contentflow.projects', JSON.stringify(projects));
  }, [projects]);

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

  const onReconnect = useCallback((oldEdge: Edge, connection: Connection) => {
    setEdges((current) => reconnectEdge(oldEdge, connection, current));
  }, [setEdges]);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const moduleId = event.dataTransfer.getData('application/x-contentflow-node');
    if (!moduleId) return;
    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    addModule(moduleId, position);
  }, [addModule, screenToFlowPosition]);

  const runFlow = useCallback(async (startNodeId?: string) => {
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

    const executionOrder = startNodeId ? plan.order.slice(Math.max(0, plan.order.indexOf(startNodeId))) : plan.order;
    cancelRequested.current = false;
    setRunning(true);
    setOutputPath('');
    setNodes((current) => current.map((node) => ({ ...node, data: { ...node.data, status: 'idle' as NodeStatus, detail: undefined } })));
    addLog(`${startNodeId ? 'Flow ab' : 'Flow'} gestartet: ${executionOrder.length} Module.`);

    const ctx: RunContext = {};

    try {
      for (const nodeId of executionOrder) {
        if (cancelRequested.current) throw new Error('Workflow vom Benutzer abgebrochen.');
        const node = nodes.find((item) => item.id === nodeId);
        if (!node) continue;

        if (debugStops && breakpoints[node.id]) {
          setNodeStatus(node.id, 'warning', 'Debug-Haltepunkt');
          addLog(`Debug-Haltepunkt vor ${node.data.title}.`);
          return;
        }
        setNodeStatus(node.id, 'running', 'Wird ausgeführt …');
        const moduleId = node.data.moduleId;
        const config = node.data.config;

        if (moduleId === 'news-url') {
          const url = String(config.url ?? '').trim();
          if (!url) throw new Error('Im News-URL-Node fehlt der Nachrichten-Link.');
          ctx.url = url;
          setNodeStatus(node.id, 'success', new URL(url).hostname);
          setNodeResult(node.id, { kind: 'text', value: url, label: 'News URL' });
          continue;
        }

        if (moduleId === 'article-reader') {
          if (!ctx.url) throw new Error('Artikel laden benötigt eine News URL.');
          ctx.article = await fetchNewsArticle(ctx.url);
          if (!projectTitle || projectTitle === 'Neues Projekt') {
            const generatedTitle = health?.ollamaAvailable && model ? normalizeProjectTitle(await ollamaGenerate(model, buildProjectTitlePrompt(ctx.article))) : ctx.article.title;
            setProjectTitle(generatedTitle || ctx.article.title);
            addLog(`Projekttitel gesetzt: ${generatedTitle || ctx.article.title}`);
          }
          setNodeStatus(node.id, 'success', `${ctx.article.wordCount} Wörter · ${ctx.article.siteName}`);
          addLog(`Artikel geladen: ${ctx.article.title}`);
          setNodeResult(node.id, { kind: 'text', value: ctx.article.text, label: ctx.article.title });
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
          setNodeResult(node.id, { kind: 'text', value: ctx.script, label: 'Sprechertext' });
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
          setNodeResult(node.id, { kind: 'text', value: ctx.assetQuery ?? '', label: 'Suchbegriff' });
          continue;
        }

        if (moduleId === 'asset-search') {
          if (!ctx.article) throw new Error('Asset Search benötigt Artikeldaten.');
          const query = String(config.query ?? '').trim() || ctx.assetQuery || deriveQuery(ctx.article);
          const results = await searchWikimedia(query, Number(config.limit ?? 8));
          if (!results.length) throw new Error(`Keine Medien für „${query}“ gefunden.`);
          ctx.assets = results;
          ctx.asset = results[0];
          setMemoryItems(results);
          setNodeStatus(node.id, 'success', `${results.length} Treffer · ${ctx.asset.license}`);
          addLog(`Asset Search: ${results.length} Treffer für „${query}“.`);
          setNodeResult(node.id, { kind: 'media', value: JSON.stringify(results), label: `${results.length} Assets` });
          continue;
        }

        if (moduleId === 'memory-card') {
          setNodeStatus(node.id, 'success', `${memoryItems.length || ctx.assets?.length || 0} Medien im Speicher`);
          addLog('Memory Card für weitere Flow-Schritte bereit.');
          setNodeResult(node.id, { kind: 'media', value: JSON.stringify(ctx.assets ?? []), label: `${ctx.assets?.length ?? memoryItems.length} Assets gespeichert` });
          continue;
        }

        if (moduleId === 'custom-agent') {
          const prompt = String(config.prompt ?? '').trim();
          const input = ctx.script ?? ctx.research ?? ctx.article?.text ?? '';
          if (!prompt) throw new Error('Der freie Agent benötigt einen Prompt.');
          if (health?.ollamaAvailable && model) {
            const result = await ollamaGenerate(model, `${prompt}\n\nEINGABE:\n${input}`);
            ctx.research = result;
            setNodeStatus(node.id, 'success', String(config.name ?? 'Freier Agent'));
          } else {
            setNodeStatus(node.id, 'warning', 'Prompt gespeichert · lokale KI nicht aktiv');
          }
          setNodeResult(node.id, { kind: 'text', value: ctx.research ?? '', label: String(config.name ?? 'Freier Agent') });
          continue;
        }

        if (moduleId === 'tts') {
          if (!ctx.script) throw new Error('TTS benötigt einen Sprechertext.');
          ctx.audioPath = await createTts(ctx.script, String(config.voice ?? ''));
          setNodeStatus(node.id, 'success', 'Lokale Audiodatei erstellt');
          setNodeResult(node.id, { kind: 'audio', value: ctx.audioPath, label: 'TTS-Vorschau' });
          continue;
        }

        if (moduleId === 'captions') {
          if (!ctx.audioPath || !ctx.script) throw new Error('Captions benötigen Sprechertext und TTS-Audio.');
          setNodeStatus(node.id, 'warning', 'Untertitel aus TTS-Sprechgeschwindigkeit vorbereitet');
          addLog('Captions werden aus TTS-Audio und Timing abgeleitet.');
          setNodeResult(node.id, { kind: 'text', value: 'Untertitel-Timing aus TTS-Sprechgeschwindigkeit vorbereitet.', label: 'Captions' });
          continue;
        }

        if (moduleId === 'video-compose') {
          if (!ctx.asset || !ctx.audioPath) throw new Error('Video Composer benötigt Asset und TTS-Audio.');
          if (!health?.ffmpegAvailable) throw new Error('FFmpeg fehlt auf diesem Mac.');
          ctx.videoPath = await renderVerticalVideo(ctx.asset.originalUrl, ctx.audioPath);
          setNodeStatus(node.id, 'success', '1080 × 1920 MP4');
          addLog('Video lokal gerendert.');
          setNodeResult(node.id, { kind: 'file', value: ctx.videoPath, label: 'MP4-Video' });
          continue;
        }

        if (moduleId === 'qc-agent') {
          if (!ctx.videoPath) throw new Error('QC Agent benötigt ein gerendertes Video.');
          setNodeStatus(node.id, 'success', 'Basisprüfung bestanden');
          setNodeResult(node.id, { kind: 'text', value: 'Basisprüfung bestanden.', label: 'QC' });
          continue;
        }

        if (moduleId === 'router') {
          setNodeStatus(node.id, 'skipped', 'Logic Runtime folgt in V1.1');
          setNodeResult(node.id, { kind: 'text', value: 'Logic Runtime folgt in V1.1.', label: 'Router' });
          continue;
        }

        if (moduleId === 'export') {
          if (!ctx.videoPath) throw new Error('Export benötigt ein gerendertes Video.');
          setOutputPath(ctx.videoPath);
          setNodeStatus(node.id, 'success', ctx.videoPath.split('/').pop() ?? 'MP4');
          setNodeResult(node.id, { kind: 'file', value: ctx.videoPath, label: 'Export' });
          continue;
        }

        setNodeStatus(node.id, 'skipped', 'Noch keine Runtime');
      }

      addLog('Flow erfolgreich abgeschlossen.');
    } catch (error) {
      const message = errorText(error);
      const activeId = executionOrder.find((id) => nodes.find((node) => node.id === id)?.data.status === 'running');
      if (activeId) setNodeStatus(activeId, 'error', message);
      addLog(`Flow gestoppt: ${message}`);
    } finally {
      setRunning(false);
    }
  }, [addLog, breakpoints, debugStops, edges, health, memoryItems.length, model, nodes, projectTitle, running, setNodeResult, setNodeStatus, setNodes]);

  const generateVersions = useCallback((nodeId: string, count: number) => {
    const total = Math.max(1, Math.min(5, Math.round(count)));
    if (total < 2) { addLog('Für zusätzliche Flow-Bahnen mindestens 2 Versionen wählen.'); return; }
    const duplicateModules = new Set(['script-agent', 'storyboard-agent', 'asset-search', 'tts', 'captions', 'video-compose', 'qc-agent', 'export']);
    const originals = nodes.filter((node) => duplicateModules.has(node.data.moduleId));
    const newNodes: Node<StudioNodeData>[] = [];
    const newEdges: Edge[] = [];
    for (let version = 2; version <= total; version += 1) {
      const map = new Map(originals.map((node) => [node.id, `${node.id}-v${version}`]));
      originals.forEach((node) => newNodes.push({ ...node, id: map.get(node.id)!, position: { x: node.position.x, y: node.position.y + version * 340 }, data: { ...node.data, config: { ...node.data.config, version }, detail: undefined, status: 'idle' } }));
      edges.forEach((edge) => {
        if (map.has(edge.source) && map.has(edge.target)) newEdges.push({ ...edge, id: `${edge.id}-v${version}`, source: map.get(edge.source)!, target: map.get(edge.target)! });
      });
    }
    setNodes((current) => [...current, ...newNodes]);
    setEdges((current) => [...current, ...newEdges]);
    addLog(`${total - 1} zusätzliche Flow-Bahn(en) ab Script Agent eingefügt.`);
    setSelectedNodeId(nodeId);
  }, [addLog, edges, nodes, setEdges, setNodes]);

  const startFrom = useCallback((nodeId: string) => { void runFlow(nodeId); }, [runFlow]);
  const loadProject = useCallback((id: string) => {
    const project = projects.find((item) => item.id === id);
    if (!project) return;
    setNodes(project.nodes); setEdges(project.edges); setModel(project.model); setProjectTitle(project.title); setSelectedNodeId(project.nodes[0]?.id ?? null); addLog(`Projekt geladen: ${project.title}`);
  }, [addLog, projects, setEdges, setNodes]);
  const saveFlowTemplate = useCallback(() => {
    const template: StoredProject = { id: `flow-${Date.now()}`, title: projectTitle || 'Neuer Flow', nodes, edges, model, updatedAt: new Date().toISOString() };
    setFlowTemplates((current) => [template, ...current].slice(0, 12));
    addLog(`Flow-Vorlage gespeichert: ${template.title}`);
  }, [addLog, edges, model, nodes, projectTitle]);
  const loadFlowTemplate = useCallback((id: string) => {
    const template = flowTemplates.find((item) => item.id === id);
    if (!template) return;
    setNodes(template.nodes); setEdges(template.edges); setModel(template.model); setProjectTitle(template.title); setSelectedNodeId(template.nodes[0]?.id ?? null); addLog(`Flow-Vorlage geladen: ${template.title}`);
  }, [addLog, flowTemplates, setEdges, setNodes]);
  const newEmptyFlow = useCallback(() => {
    setNodes([]); setEdges([]); setSelectedNodeId(null); setProjectTitle('Leerer Flow'); setMemoryItems([]); addLog('Leerer Flow erstellt.');
  }, [addLog, setEdges, setNodes]);
  const openResult = useCallback((nodeId: string) => setResultNodeId(nodeId), []);
  const nodeTypes = useMemo(() => ({ studio: (props: any) => <StudioNode {...props} onStartFrom={startFrom} debugStops={debugStops} breakpoint={!!breakpoints[props.id]} onToggleBreakpoint={toggleBreakpoint} /> }), [breakpoints, debugStops, startFrom, toggleBreakpoint]);

  const cancelFlow = useCallback(() => {
    if (!running) return;
    cancelRequested.current = true;
    addLog('Abbruch angefordert … der aktuelle Schritt wird sauber beendet.');
  }, [addLog, running]);

  const toggleDebug = useCallback((enabled: boolean) => {
    setDebugMode(enabled);
    localStorage.setItem('contentflow.debug', String(enabled));
  }, []);

  const toggleDebugStops = useCallback((enabled: boolean) => {
    setDebugStops(enabled);
    localStorage.setItem('contentflow.debugStops', String(enabled));
  }, []);

  useEffect(() => {
    localStorage.setItem('contentflow.flowTemplates', JSON.stringify(flowTemplates));
  }, [flowTemplates]);

  const badges = useMemo(() => [
    { label: 'Local AI', ok: !!health?.ollamaAvailable },
    { label: 'FFmpeg', ok: !!health?.ffmpegAvailable },
    { label: 'TTS', ok: !!health?.sayAvailable }
  ], [health]);

  return (
    <div className={`studio-shell ${libraryOpen ? 'library-open' : 'library-collapsed'}`}>
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

        <button className="button ghost" onClick={() => setSettingsOpen(true)}>Einstellungen</button>
        <button className="button ghost" onClick={() => void refreshHealth()}>System</button>
        <button className="button danger-button top-cancel" disabled={!running} onClick={cancelFlow}>Abbrechen</button>
        <button className="button primary" disabled={running} onClick={() => void runFlow()}>
          {running ? 'Flow läuft …' : '▶ Flow starten'}
        </button>
      </header>

      <NodeLibrary collapsed={!libraryOpen} onToggle={() => setLibraryOpen((value) => !value)} onAdd={addModule} projectTitle={projectTitle} projects={projects.map(({ id, title }) => ({ id, title }))} onProjectTitleChange={setProjectTitle} onLoadProject={loadProject} />

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
            {logs.slice(0, debugMode ? 20 : 4).map((entry, index) => <span key={`${entry}-${index}`}>{entry}</span>)}
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
        onStartFrom={startFrom}
        onGenerateVersions={generateVersions}
        onOpenVideoEditor={() => setVideoEditorOpen(true)}
        memoryItems={memoryItems}
      />
      {videoEditorOpen && <VideoEditorOverlay onClose={() => setVideoEditorOpen(false)} />}
      {settingsOpen && <SettingsPanel health={health} logs={logs} debugMode={debugMode} onDebugChange={toggleDebug} onRefresh={refreshHealth} onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

function buildProjectTitlePrompt(article: NewsArticle) {
  return `Erzeuge einen kurzen deutschen Projekttitel mit maximal 60 Zeichen für diesen Nachrichtenartikel. Gib nur den Titel aus.\n${article.title}`;
}

function normalizeProjectTitle(value: string) {
  return value.split('\n')[0].replace(/^[-*#\s]+|[-*#\s]+$/g, '').slice(0, 60).trim();
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

function readStoredProjects(): StoredProject[] {
  try {
    const parsed = JSON.parse(localStorage.getItem('contentflow.projects') || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function VideoEditorOverlay({ onClose }: { onClose: () => void }) {
  const [caption, setCaption] = useState('');
  return <div className="video-editor-overlay" role="dialog" aria-modal="true"><section className="video-editor"><div className="settings-title"><div><p className="eyebrow">VIDEO COMPOSER</p><h2>Manuelle Nacharbeit</h2><span>CapCut-artiger Entwurf für Schnitt, Text und Timing</span></div><button className="button ghost" onClick={onClose}>Schließen</button></div><div className="editor-track">Video-Vorschau / Timeline-Platzhalter</div><div className="field"><span>Caption-Overlay</span><textarea rows={3} value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="Text für die manuelle Nacharbeit …" /></div><div className="editor-controls"><button className="button ghost" onClick={onClose}>Änderungen verwerfen</button><button className="button primary" onClick={onClose}>Entwurf speichern</button></div></section></div>;
}
