import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Play, Save, Search } from 'lucide-react';
import { ModuleConfigFields } from './components/ModuleConfigFields';
import { libraryModules, moduleRegistry } from './core/moduleRegistry';
import { runSingleModule, runWorkflow } from './core/runner';
import type { RunLog, WorkflowNodeData } from './core/types';

const initialNodes: Node<WorkflowNodeData>[] = [
  {
    id: '1',
    type: 'workflow',
    position: { x: 70, y: 70 },
    data: {
      moduleId: 'article-import',
      label: 'Artikel-Link',
      category: 'Trigger',
      description: 'Lädt einen Artikel und stellt den Text für den Flow bereit',
      config: { url: '' },
    },
  },
  {
    id: '2',
    type: 'workflow',
    position: { x: 370, y: 70 },
    data: {
      moduleId: 'news-package',
      label: 'Newspaket',
      category: 'Produktion',
      description: 'Extrahiert Kernthemen und erstellt Paket',
    },
  },
  {
    id: '3',
    type: 'workflow',
    position: { x: 680, y: 70 },
    data: {
      moduleId: 'headline-generator',
      label: 'Schlagzeilengenerator',
      category: 'GPT',
      description: 'Erstellt mehrere Hook-Varianten',
      config: { variants: 5 },
    },
  },
  {
    id: '4',
    type: 'workflow',
    position: { x: 680, y: 290 },
    data: {
      moduleId: 'research',
      label: 'Recherche',
      category: 'Recherche',
      description: 'Sammelt aktuelle Infos und Hintergründe',
    },
  },
  {
    id: '5',
    type: 'workflow',
    position: { x: 370, y: 290 },
    data: {
      moduleId: 'asset-check',
      label: 'Asset Check',
      category: 'Assets',
      description: 'Prüft Bild- und Videomaterial',
    },
  },
  {
    id: '6',
    type: 'workflow',
    position: { x: 280, y: 510 },
    data: {
      moduleId: 'wait-audio',
      label: 'Wait for Audio',
      category: 'Audio',
      description: 'Wartet auf Voiceover',
    },
  },
  {
    id: '7',
    type: 'workflow',
    position: { x: 560, y: 510 },
    data: {
      moduleId: 'wait-video',
      label: 'Wait for Video',
      category: 'Video',
      description: 'Wartet auf Videomaterial',
    },
  },
  {
    id: '8',
    type: 'workflow',
    position: { x: 420, y: 710 },
    data: {
      moduleId: 'auto-render',
      label: 'Auto Render',
      category: 'Produktion',
      description: 'Kombiniert Audio, Video und Untertitel',
    },
  },
  {
    id: '9',
    type: 'workflow',
    position: { x: 750, y: 710 },
    data: {
      moduleId: 'ready',
      label: 'Ready',
      category: 'Output',
      description: 'Video ist bereit',
    },
  },
];

const initialEdges: Edge[] = [
  { id: 'e12', source: '1', target: '2' },
  { id: 'e23', source: '2', target: '3' },
  { id: 'e34', source: '3', target: '4' },
  { id: 'e45', source: '4', target: '5' },
  { id: 'e56', source: '5', target: '6' },
  { id: 'e57', source: '5', target: '7' },
  { id: 'e68', source: '6', target: '8' },
  { id: 'e78', source: '7', target: '8' },
  { id: 'e89', source: '8', target: '9' },
];

type ErrorWithLogs = Error & { workflowLogs?: RunLog[] };

function WorkflowNode({ data, selected }: NodeProps<Node<WorkflowNodeData>>) {
  const mod = moduleRegistry[data.moduleId];
  return (
    <div
      className={`node ${selected ? 'selected' : ''} ${data.status || ''}`}
      style={{ '--accent': mod?.color || '#64748b' } as CSSProperties}
    >
      <Handle type="target" position={Position.Left} />
      <div className="node-dot" />
      <div>
        <strong>{data.label}</strong>
        <span>{data.category}</span>
        <p>{data.description}</p>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function outputPreview(output?: Record<string, unknown>) {
  if (!output) return {};
  const preview = { ...output };
  if (typeof preview.articleText === 'string' && preview.articleText.length > 1600) {
    preview.articleText = `${preview.articleText.slice(0, 1600)}\n\n… [Vorschau gekürzt]`;
  }
  return preview;
}

function logsFromError(error: unknown): RunLog[] {
  if (error instanceof Error && (error as ErrorWithLogs).workflowLogs) {
    return (error as ErrorWithLogs).workflowLogs || [];
  }
  return [];
}

export default function App() {
  const [nodes, setNodes] = useState(initialNodes);
  const [edges, setEdges] = useState(initialEdges);
  const [selectedId, setSelectedId] = useState('1');
  const [logs, setLogs] = useState<RunLog[]>([]);
  const [running, setRunning] = useState(false);
  const [testing, setTesting] = useState(false);

  const nodeTypes = useMemo(() => ({ workflow: WorkflowNode }), []);
  const selected = nodes.find((node) => node.id === selectedId) || null;
  const selectedModule = selected ? moduleRegistry[selected.data.moduleId] : null;
  const groups = libraryModules.reduce<Record<string, typeof libraryModules>>((acc, module) => {
    (acc[module.category] ??= []).push(module);
    return acc;
  }, {});

  const onNodesChange = (changes: NodeChange<Node<WorkflowNodeData>>[]) =>
    setNodes((current) => applyNodeChanges(changes, current));
  const onEdgesChange = (changes: EdgeChange[]) =>
    setEdges((current) => applyEdgeChanges(changes, current));
  const onConnect = (connection: Connection) =>
    setEdges((current) => addEdge(connection, current));

  const applyLogsToNodes = (runLogs: RunLog[], outputs?: Record<string, Record<string, unknown>>) => {
    setNodes((current) => current.map((node) => {
      const lastLog = [...runLogs].reverse().find((log) => log.nodeId === node.id);
      if (!lastLog) return node;
      return {
        ...node,
        data: {
          ...node.data,
          status: lastLog.status,
          output: outputs?.[node.id] ?? lastLog.output ?? node.data.output,
        },
      };
    }));
  };

  const run = async () => {
    setRunning(true);
    setLogs([]);
    try {
      const result = await runWorkflow(nodes, edges);
      setLogs(result.logs);
      applyLogsToNodes(result.logs, result.outputs);
    } catch (error) {
      const errorLogs = logsFromError(error);
      setLogs(errorLogs);
      applyLogsToNodes(errorLogs);
      console.error(error);
    } finally {
      setRunning(false);
    }
  };

  const testSelected = async () => {
    if (!selected) return;
    setTesting(true);
    setLogs([]);
    try {
      const result = await runSingleModule(selected);
      setLogs(result.logs);
      setNodes((current) => current.map((node) => node.id === selected.id
        ? { ...node, data: { ...node.data, status: 'success', output: result.output } }
        : node));
    } catch (error) {
      const errorLogs = logsFromError(error);
      setLogs(errorLogs);
      setNodes((current) => current.map((node) => node.id === selected.id
        ? { ...node, data: { ...node.data, status: 'error' } }
        : node));
      console.error(error);
    } finally {
      setTesting(false);
    }
  };

  const updateSelectedConfig = (key: string, value: unknown) => {
    if (!selected) return;
    setNodes((current) => current.map((node) => node.id === selected.id
      ? { ...node, data: { ...node.data, config: { ...node.data.config, [key]: value } } }
      : node));
  };

  return (
    <div className="app">
      <header>
        <div className="brand">TikTok News Studio <b>BETA</b></div>
        <nav>Projekte <span>Workflows</span> Medien Vorlagen Analytics</nav>
        <div className="search"><Search size={16} /> In Projekten, Dateien, Workflows suchen ...</div>
      </header>

      <div className="toolbar">
        <div><small>Aktuelles Projekt</small><strong>Morning Briefing</strong></div>
        <div><h2>TikTok Daily News</h2><p>Automatisierte News-Produktion für TikTok</p></div>
        <div className="actions">
          <button><Save size={16} /> Gespeichert</button>
          <button onClick={run} disabled={running || testing} className="primary">
            <Play size={16} /> {running ? 'Läuft...' : 'Workflow starten'}
          </button>
        </div>
      </div>

      <main>
        <aside className="library">
          <div className="tabs"><b>Bausteine</b><span>Vorlagen</span><span>Meine Nodes</span></div>
          <input placeholder="Bausteine suchen ..." />
          {Object.entries(groups).map(([category, modules]) => (
            <section key={category}>
              <h4>{category}</h4>
              {modules.map((module) => (
                <div className="lib-item" key={module.id}>
                  <i style={{ background: module.color }} />
                  <div><b>{module.name}</b><small>{module.description}</small></div>
                </div>
              ))}
            </section>
          ))}
        </aside>

        <section className="canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => setSelectedId(node.id)}
            fitView
          >
            <Background gap={18} />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </section>

        <aside className="inspector">
          {selected && selectedModule && (
            <>
              <div className="inspector-title">
                <div className="icon">✦</div>
                <div>
                  <h3>{selected.data.label}</h3>
                  <span>{selected.data.category} · v{selectedModule.version || 'dev'}</span>
                </div>
              </div>

              <div className="inspector-tabs"><b>Konfiguration</b><span>Output</span><span>Hinweise</span></div>
              <label>Modul-ID<input value={selected.data.moduleId} readOnly /></label>
              <label>Beschreibung<textarea value={selected.data.description} readOnly /></label>

              <ModuleConfigFields
                module={selectedModule}
                config={selected.data.config || {}}
                onChange={updateSelectedConfig}
              />

              <button className="module-test" onClick={testSelected} disabled={testing || running}>
                <Play size={15} /> {testing ? 'Modul läuft...' : 'Modul testen'}
              </button>

              {!!selectedModule.outputs?.length && (
                <div className="contract">
                  <h4>Output-Vertrag</h4>
                  {selectedModule.outputs.map((field) => (
                    <div key={field.key}>
                      <code>{field.key}</code>
                      <span>{field.type}{field.required ? ' · Pflicht' : ''}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="output">
                <h4>Letzter Output</h4>
                <pre>{JSON.stringify(outputPreview(selected.data.output), null, 2)}</pre>
              </div>

              <div className="runlog">
                <h4>Testlauf</h4>
                {logs.length === 0 && <p className="muted">Noch kein Lauf ausgeführt.</p>}
                {logs.slice(-10).map((log, index) => (
                  <div key={`${log.nodeId}-${index}`} className={`log ${log.status}`}>{log.message}</div>
                ))}
              </div>
            </>
          )}
        </aside>
      </main>
    </div>
  );
}
