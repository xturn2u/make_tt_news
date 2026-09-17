import { useCallback, useMemo, useRef, useState } from 'react';
import type { CSSProperties, DragEvent } from 'react';
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
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { GripVertical, Search, Settings2, Sparkles } from 'lucide-react';
import { ModuleWorkspace } from './components/ModuleWorkspace';
import { emptyProject, type ProjectState } from './domain/project';

type ModuleId = 'json-input'|'news-package'|'headline'|'research'|'assets'|'studio'|'img2vid';
type NodeData = { moduleId: ModuleId; label: string; description: string; color: string; icon: string };
type ModuleDef = NodeData & { category: 'Flow'|'Optional' };

const modules: ModuleDef[] = [
  { moduleId:'json-input',label:'JSON Input',description:'Newspaket importieren',color:'#0ea5e9',icon:'{}',category:'Flow' },
  { moduleId:'news-package',label:'Newspaket',description:'Versionen, Text & Prompter',color:'#7c3aed',icon:'N',category:'Flow' },
  { moduleId:'headline',label:'Schlagzeile',description:'Dreizeiler & PNG',color:'#ef4444',icon:'H',category:'Flow' },
  { moduleId:'research',label:'Recherche',description:'Suche & Downloader',color:'#2563eb',icon:'R',category:'Flow' },
  { moduleId:'assets',label:'Assets',description:'Medienbibliothek',color:'#16a34a',icon:'A',category:'Flow' },
  { moduleId:'studio',label:'Studio',description:'Timeline & Produktion',color:'#111827',icon:'S',category:'Flow' },
  { moduleId:'img2vid',label:'Img2Vid',description:'Optionaler KI-Clip',color:'#db2777',icon:'V',category:'Optional' },
];
const byId=Object.fromEntries(modules.map(m=>[m.moduleId,m])) as Record<ModuleId,ModuleDef>;

const initialNodes: Node<NodeData>[] = [
  ['input','json-input',80,120],['news','news-package',360,120],['headline','headline',640,120],['research','research',920,120],['assets','assets',1200,120],['studio','studio',1480,120],['img2vid','img2vid',1200,360],
].map(([id,moduleId,x,y])=>({id:String(id),type:'module',position:{x:Number(x),y:Number(y)},data:byId[moduleId as ModuleId]}));
const initialEdges: Edge[]=[
  ['input','news'],['news','headline'],['headline','research'],['research','assets'],['assets','studio'],['assets','img2vid'],['img2vid','studio'],
].map(([source,target],i)=>({id:`e${i}`,source,target,type:'smoothstep'}));

function FlowNode({data,selected}:NodeProps<Node<NodeData>>){return <div className={`flow-node ${selected?'selected':''}`} style={{'--node':data.color} as CSSProperties}><Handle type="target" position={Position.Left}/><div className="node-icon">{data.icon}</div><div className="node-text"><strong>{data.label}</strong><span>{data.description}</span></div><Handle type="source" position={Position.Right}/></div>}

function Workflow(){
  const [nodes,setNodes]=useState(initialNodes); const [edges,setEdges]=useState(initialEdges); const [selected,setSelected]=useState<string>('input'); const [project,setProject]=useState<ProjectState>(emptyProject()); const [query,setQuery]=useState('');
  const reactFlow=useReactFlow(); const wrapper=useRef<HTMLDivElement>(null);
  const nodeTypes=useMemo(()=>({module:FlowNode}),[]);
  const selectedNode=nodes.find(n=>n.id===selected); const moduleId=selectedNode?.data.moduleId;
  const filtered=modules.filter(m=>m.label.toLowerCase().includes(query.toLowerCase())||m.description.toLowerCase().includes(query.toLowerCase()));
  const statusFor=(id:ModuleId)=>{if(id==='json-input')return project.newsPackage?'ready':'';if(!project.newsPackage)return '';if(id==='news-package')return 'ready';if(id==='headline')return project.assets.some(a=>a.kind==='headline')?'ready':'';if(id==='assets')return project.assets.length?'ready':'';if(id==='studio')return project.timeline.length?'ready':'';return ''};
  const onDrop=useCallback((event:DragEvent)=>{event.preventDefault();const id=event.dataTransfer.getData('application/module') as ModuleId;if(!id||!byId[id]||!wrapper.current)return;if(id==='json-input'&&nodes.some(n=>n.data.moduleId==='json-input'))return;const position=reactFlow.screenToFlowPosition({x:event.clientX,y:event.clientY});const node:Node<NodeData>={id:`${id}-${Date.now()}`,type:'module',position,data:byId[id]};setNodes(cur=>[...cur,node]);setSelected(node.id)},[nodes,reactFlow]);
  const onConnect=(c:Connection)=>{if(!c.source||!c.target)return;setEdges(cur=>addEdge({...c,type:'smoothstep'},cur))};
  return <div className="app-shell">
    <header className="appbar"><div className="brand"><span className="brandmark">PM</span><div><strong>Projektmanagement</strong><small>{project.newsPackage?.meta.topic||'Neues Projekt'}</small></div></div><div className="project-meta">{project.newsPackage?<><span className="status-dot ok"/>Paket geladen · {project.assets.length} Assets · {project.timeline.length} Clips</>:<><span className="status-dot"/>JSON importieren, um zu starten</>}</div><button className="ghost"><Settings2 size={16}/>Tools</button></header>
    <div className="work-area">
      <aside className="module-library"><div className="library-title"><b>Bausteine</b><span>Drag & Drop</span></div><div className="library-search"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Suchen…"/></div>{(['Flow','Optional'] as const).map(cat=><section key={cat}><h4>{cat}</h4>{filtered.filter(m=>m.category===cat).map(m=><button className="module-item" draggable key={m.moduleId} onDragStart={e=>{e.dataTransfer.setData('application/module',m.moduleId);e.dataTransfer.effectAllowed='move'}} onClick={()=>{const n=nodes.find(n=>n.data.moduleId===m.moduleId);if(n)setSelected(n.id)}}><GripVertical size={14}/><i style={{background:m.color}}>{m.icon}</i><div><strong>{m.label}</strong><span>{m.description}</span></div>{statusFor(m.moduleId)==='ready'&&<em>✓</em>}</button>)}</section>)}</aside>
      <main ref={wrapper} className="flow-canvas" onDrop={onDrop} onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect='move'}}>
        <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={(c:NodeChange<Node<NodeData>>[])=>setNodes(n=>applyNodeChanges(c,n))} onEdgesChange={(c:EdgeChange[])=>setEdges(e=>applyEdgeChanges(c,e))} onConnect={onConnect} onNodeClick={(_,n)=>setSelected(n.id)} fitView minZoom={.35} maxZoom={1.5} deleteKeyCode={['Backspace','Delete']}>
          <Background gap={22} size={1}/><Controls showInteractive={false}/><MiniMap pannable zoomable nodeColor={n=>(n.data as NodeData).color}/>
        </ReactFlow>
        <div className="canvas-hint"><Sparkles size={15}/><span>Node anklicken = Funktion öffnen · Bausteine links auf die Fläche ziehen</span></div>
      </main>
      {moduleId&&<ModuleWorkspace moduleId={moduleId} project={project} setProject={setProject} onClose={()=>setSelected('')}/>} 
    </div>
  </div>
}

export default function App(){return <ReactFlowProvider><Workflow/></ReactFlowProvider>}
