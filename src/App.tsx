import { useCallback, useMemo, useState } from 'react';
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
import { Play, Plus, Save, Search } from 'lucide-react';
import { ModuleConfigFields } from './components/ModuleConfigFields';
import { libraryModules, moduleRegistry } from './core/moduleRegistry';
import { runSingleModule, runWorkflow } from './core/runner';
import type { RunLog, WorkflowNodeData } from './core/types';

const initialNodes: Node<WorkflowNodeData>[] = [
  {
    id: 'news',
    type: 'workflow',
    position: { x: 360, y: 70 },
    data: {
      moduleId: 'news-package',
      label: 'Newspaket',
      category: 'Produktion',
      description: 'Übernimmt Daten aus GPT Sites oder einem manuellen Text-Input',
    },
  },
  {
    id: 'headline',
    type: 'workflow',
    position: { x: 690, y: 70 },
    data: {
      moduleId: 'headline-generator',
      label: 'Schlagzeilengenerator',
      category: 'GPT',
      description: 'Erstellt mehrere Hook-Varianten',
      config: { variants: 5 },
    },
  },
  {
    id: 'research',
    type: 'workflow',
    position: { x: 690, y: 290 },
    data: {
      moduleId: 'research',
      label: 'Recherche',
      category: 'Recherche',
      description: 'Sammelt aktuelle Infos und Hintergründe',
    },
  },
  {
    id: 'assets',
    type: 'workflow',
    position: { x: 380, y: 290 },
    data: {
      moduleId: 'asset-check',
      label: 'Asset Check',
      category: 'Assets',
      description: 'Prüft Bild- und Videomaterial',
    },
  },
  {
    id: 'audio',
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
    id: 'video',
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
    id: 'render',
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
    id: 'ready',
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
  { id: 'e-news-headline', source: 'news', target: 'headline' },
  { id: 'e-headline-research', source: 'headline', target: 'research' },
  { id: 'e-research-assets', source: 'research', target: 'assets' },
  { id: 'e-assets-audio', source: 'assets', target: 'audio' },
  { id: 'e-assets-video', source: 'assets', target: 'video' },
  { id: 'e-audio-render', source: 'audio', target: 'render' },
  { id: 'e-video-render', source: 'video', target: 'render' },
  { id: 'e-render-ready', source: 'render', target: 'ready' },
];

type ErrorWithLogs = Error & { workflowLogs?: RunLog[] };
type WorkflowNodeExtraProps = NodeProps<Node<WorkflowNodeData>> & {
  onAddInput: (nodeId: string) => void;
};

function WorkflowNode({ id, data, selected, onAddInput }: WorkflowNodeExtraProps) {
  const mod = moduleRegistry[data.moduleId];
  const isInput = data.moduleId === 'flow-input';
  const inputLabel = data.config?.inputType === 'text' ? 'Freitext' : 'GPT Sites';

  return (
    <div
      className={`node ${selected ? 'selected' : ''} ${data.status || ''} ${isInput ? 'input-node' : ''}`}
      style={{ '--accent': mod?.color || '#64748b' } as CSSProperties}
    >
      <Handle type="target" position={Position.Left} />
      <div className="node-dot" />
      <div className="node-copy">
        <strong>{data.label}</strong>
        <span>{isInput ? inputLabel : data.category}</span>
        <p>{data.description}</p>
      </div>
      {data.moduleId === 'news-package' && (
        <button
          type="button"
          className="add-input nodrag nopan"
          title="Flow Input hinzufügen"
          onClick={(event) => {
            event.stopPropagation();
            onAddInput(id);
          }}
        >
          <Plus size={14} /> Input
        </button>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function outputPreview(output?: Record<string, unknown>) {
  if (!output) return {};
  const preview = { ...output };
  for (const key of ['rawText', 'packageText']) {
    if (typeof preview[key] === 'string' && preview[key].length > 1600) {
      preview[key] = `${preview[key].slice(0, 1600)}\n\n… [Vorschau gekürzt]`;
    }
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
  const [selectedId, setSelectedId] = useState('news');
  const [logs, setLogs] = useState<RunLog[]>([]);
  const [running, setRunning] = useState(false);
  const [testing, setTesting] = useState(false);

  const addInputToNode = useCallback((targetId: string) => {
    setNodes((currentNodes) => {
      const target = currentNodes.find((node) => node.id === targetId);
      if (!target) return currentNodes;

      const inputCount = currentNodes.filter((node) => node.data.moduleId === 'flow-input').length;
      const id = `flow-input-${Date.now()}-${inputCount}`;
      const newNode: Node<WorkflowNodeData> = {
        id,
        type: 'workflow',
        position: {
          x: target.position.x - 310,
          y: target.position.y + (inputCount * 130),
        },
        data: {
          moduleId: 'flow-input',
          label: 'Flow Input',
          category: 'Input',
          description: 'Liefert GPT-Sites-Daten oder freien Text an das Newspaket',
          config: {
            inputType: 'gpt-sites-package',
            content: '',
          },
        },
      };

      setEdges((currentEdges) => [
        ...currentEdges,
        { id: `e-${id}-${targetId}`, source: id, target: targetId },
      ]);
      setSelectedId(id);
      return [...currentNodes, newNode];
    });
  }, []);

  const WorkflowNodeComponent = useCallback(
    (props: NodeProps<Node<WorkflowNodeData>>) => (
      <WorkflowNode {...props} onAddInput={addInputToNode} />
    ),
    [addInputToNode],
  );

  const nodeTypes = useMemo(() => ({ workflow: WorkflowNodeComponent }), [WorkflowNodeComponent]);
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
        <div><h2>TikTok Daily News</h2><p>Modularer Produktions-Workflow</p></div>
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

              {selected.data.moduleId === 'news-package' && (
                <button className="add-input-inspector" onClick={() => addInputToNode(selected.id)}>
                  <Plus size={15} /> Flow Input hinzufügen
                </button>
              )}

              <button className="module-test" onClick={testSelected} disabled={testing || running}>
                <Play size={15} /> {testing ? 'Modul läuft...' : 'Modul testen'}
              </button>

              {!!selectedModule.inputs?.length && (
                <div className="contract">
                  <h4>Input-Vertrag</h4>
                  {selectedModule.inputs.map((field) => (
                    <div key={field.key}>
                      <code>{field.key}</code>
                      <span>{field.type}{field.required ? ' · Pflicht' : ''}</span>
                    </div>
                  ))}
                </div>
              )}

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
