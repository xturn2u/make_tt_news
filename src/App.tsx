import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { availableVersionKeys, emptyProject, type ProjectState, type VersionKey } from './domain/project';

type ModuleId = 'json-input'|'news-package'|'headline'|'research'|'assets'|'studio'|'img2vid';
type NodeData = {
  moduleId: ModuleId;
  label: string;
  description: string;
  color: string;
  icon: string;
  version?: VersionKey;
  shared?: boolean;
};
type ModuleDef = Omit<NodeData, 'version'|'shared'> & { category: 'Flow'|'Optional'; versioned?: boolean; singleton?: boolean };

const modules: ModuleDef[] = [
  { moduleId:'json-input',label:'JSON Input',description:'Newspaket importieren',color:'#0ea5e9',icon:'{}',category:'Flow',singleton:true },
  { moduleId:'news-package',label:'Newspaket',description:'Text & Paketdaten',color:'#7c3aed',icon:'N',category:'Flow',versioned:true },
  { moduleId:'headline',label:'Schlagzeile',description:'Dreizeiler & PNG',color:'#ef4444',icon:'H',category:'Flow',versioned:true },
  { moduleId:'research',label:'Recherche',description:'Suche & Downloader',color:'#2563eb',icon:'R',category:'Flow',versioned:true },
  { moduleId:'assets',label:'Assets',description:'Gemeinsame Medienbibliothek',color:'#16a34a',icon:'A',category:'Flow',singleton:true },
  { moduleId:'studio',label:'Studio',description:'Timeline & Produktion',color:'#111827',icon:'S',category:'Flow',versioned:true },
  { moduleId:'img2vid',label:'Img2Vid',description:'Optionaler KI-Clip',color:'#db2777',icon:'V',category:'Optional' },
];
const byId=Object.fromEntries(modules.map(m=>[m.moduleId,m])) as Record<ModuleId,ModuleDef>;

function nodeData(moduleId: ModuleId, version?: VersionKey, shared=false): NodeData {
  const def=byId[moduleId];
  return {
    moduleId,
    label: version ? `${def.label} ${version.toUpperCase()}` : shared ? `${def.label} · gemeinsam` : def.label,
    description: shared ? 'Für alle Versionen verfügbar' : def.description,
    color:def.color,
    icon:def.icon,
    version,
    shared,
  };
}

function baseGraph(): { nodes: Node<NodeData>[]; edges: Edge[] } {
  return {
    nodes: [
      { id:'input',type:'module',position:{x:70,y:250},data:nodeData('json-input') },
      { id:'assets-shared',type:'module',position:{x:980,y:40},data:nodeData('assets',undefined,true) },
    ],
    edges: [],
  };
}

function graphForVersions(versions: VersionKey[]): { nodes: Node<NodeData>[]; edges: Edge[] } {
  if (!versions.length) return baseGraph();
  const nodes: Node<NodeData>[] = [
    { id:'input',type:'module',position:{x:50,y:170+(versions.length-1)*105},data:nodeData('json-input') },
    { id:'assets-shared',type:'module',position:{x:1010,y:20},data:nodeData('assets',undefined,true) },
  ];
  const edges: Edge[]=[];

  versions.forEach((version,index)=>{
    const y=120+index*230;
    const ids={
      news:`news-${version}`,
      headline:`headline-${version}`,
      research:`research-${version}`,
      studio:`studio-${version}`,
    };
    nodes.push(
      { id:ids.news,type:'module',position:{x:330,y},data:nodeData('news-package',version) },
      { id:ids.headline,type:'module',position:{x:610,y},data:nodeData('headline',version) },
      { id:ids.research,type:'module',position:{x:890,y},data:nodeData('research',version) },
      { id:ids.studio,type:'module',position:{x:1250,y},data:nodeData('studio',version) },
    );
    edges.push(
      {id:`e-input-${version}`,source:'input',target:ids.news,type:'smoothstep'},
      {id:`e-news-headline-${version}`,source:ids.news,target:ids.headline,type:'smoothstep'},
      {id:`e-headline-research-${version}`,source:ids.headline,target:ids.research,type:'smoothstep'},
      {id:`e-research-studio-${version}`,source:ids.research,target:ids.studio,type:'smoothstep'},
      {id:`e-assets-studio-${version}`,source:'assets-shared',target:ids.studio,type:'smoothstep',animated:true},
    );
  });

  return {nodes,edges};
}

const startGraph=baseGraph();

function FlowNode({data,selected}:NodeProps<Node<NodeData>>){
  return <div className={`flow-node ${selected?'selected':''} ${data.shared?'shared-node':''}`} style={{'--node':data.color} as CSSProperties}>
    <Handle type="target" position={Position.Left}/>
    <div className="node-icon">{data.icon}</div>
    <div className="node-text"><strong>{data.label}</strong><span>{data.description}</span></div>
    {data.version&&<em className="version-chip">{data.version.toUpperCase()}</em>}
    {data.shared&&<em className="shared-chip">GLOBAL</em>}
    <Handle type="source" position={Position.Right}/>
  </div>;
}

function Workflow(){
  const [nodes,setNodes]=useState<Node<NodeData>[]>(startGraph.nodes);
  const [edges,setEdges]=useState<Edge[]>(startGraph.edges);
  const [selected,setSelected]=useState<string>('input');
  const [project,setProject]=useState<ProjectState>(emptyProject());
  const [query,setQuery]=useState('');
  const reactFlow=useReactFlow();
  const wrapper=useRef<HTMLDivElement>(null);
  const nodeTypes=useMemo(()=>({module:FlowNode}),[]);
  const versions=useMemo(()=>availableVersionKeys(project.newsPackage),[project.newsPackage]);
  const totalClips=useMemo(()=>versions.reduce((sum,key)=>sum+(project.versionFlows[key]?.timeline.length||0),0),[versions,project.versionFlows]);

  useEffect(()=>{
    if(project.workflowRevision===0)return;
    const next=graphForVersions(availableVersionKeys(project.newsPackage));
    setNodes(next.nodes);
    setEdges(next.edges);
    const first=availableVersionKeys(project.newsPackage)[0];
    setSelected(first?`news-${first}`:'input');
    window.setTimeout(()=>reactFlow.fitView({padding:.15,duration:350}),0);
  },[project.workflowRevision,project.newsPackage,reactFlow]);

  const selectedNode=nodes.find(n=>n.id===selected);
  const moduleId=selectedNode?.data.moduleId;
  const selectedVersion=selectedNode?.data.version;
  const filtered=modules.filter(m=>m.label.toLowerCase().includes(query.toLowerCase())||m.description.toLowerCase().includes(query.toLowerCase()));

  const onDrop=useCallback((event:DragEvent)=>{
    event.preventDefault();
    const id=event.dataTransfer.getData('application/module') as ModuleId;
    if(!id||!byId[id]||!wrapper.current)return;
    const def=byId[id];
    if(def.singleton&&nodes.some(n=>n.data.moduleId===id))return;
    const position=reactFlow.screenToFlowPosition({x:event.clientX,y:event.clientY});
    const version=def.versioned&&project.newsPackage?project.activeVersion:undefined;
    const node:Node<NodeData>={id:`${id}-${version||'shared'}-${Date.now()}`,type:'module',position,data:nodeData(id,version,id==='assets')};
    setNodes(cur=>[...cur,node]);
    setSelected(node.id);
  },[nodes,reactFlow,project.activeVersion,project.newsPackage]);

  const onConnect=(c:Connection)=>{if(!c.source||!c.target)return;setEdges(cur=>addEdge({...c,type:'smoothstep'},cur))};
  const openNode=(node:Node<NodeData>)=>{
    if(node.data.version)setProject(p=>({...p,activeVersion:node.data.version!}));
    setSelected(node.id);
  };

  return <div className="app-shell">
    <header className="appbar">
      <div className="brand"><span className="brandmark">PM</span><div><strong>Projektmanagement</strong><small>{project.newsPackage?.meta.topic||'Neues Projekt'}</small></div></div>
      <div className="project-meta">{project.newsPackage?<><span className="status-dot ok"/>{versions.length} Flow{versions.length===1?'':'s'} · {project.assets.length} gemeinsame Assets · {totalClips} Clips</>:<><span className="status-dot"/>JSON importieren, um zu starten</>}</div>
      <button className="ghost"><Settings2 size={16}/>Tools</button>
    </header>
    <div className="work-area">
      <aside className="module-library">
        <div className="library-title"><b>Bausteine</b><span>Drag & Drop</span></div>
        <div className="library-search"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Suchen…"/></div>
        {(['Flow','Optional'] as const).map(cat=><section key={cat}><h4>{cat}</h4>{filtered.filter(m=>m.category===cat).map(m=><button className="module-item" draggable key={m.moduleId} onDragStart={e=>{e.dataTransfer.setData('application/module',m.moduleId);e.dataTransfer.effectAllowed='move'}} onClick={()=>{const n=nodes.find(n=>n.data.moduleId===m.moduleId&&(m.versioned?n.data.version===project.activeVersion:true));if(n)openNode(n)}}><GripVertical size={14}/><i style={{background:m.color}}>{m.icon}</i><div><strong>{m.label}</strong><span>{m.description}</span></div></button>)}</section>)}
      </aside>
      <main ref={wrapper} className="flow-canvas" onDrop={onDrop} onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect='move'}}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={(c:NodeChange<Node<NodeData>>[])=>setNodes(n=>applyNodeChanges(c,n))}
          onEdgesChange={(c:EdgeChange[])=>setEdges(e=>applyEdgeChanges(c,e))}
          onConnect={onConnect}
          onNodeClick={(_,n)=>openNode(n)}
          fitView
          minZoom={.3}
          maxZoom={1.5}
          deleteKeyCode={['Backspace','Delete']}
        >
          <Background gap={22} size={1}/><Controls showInteractive={false}/><MiniMap pannable zoomable nodeColor={n=>(n.data as NodeData).color}/>
        </ReactFlow>
        <div className="canvas-hint"><Sparkles size={15}/><span>Jede Paketversion erhält automatisch einen eigenen Produktionsstrang · Assets sind gemeinsam</span></div>
      </main>
      {moduleId&&<ModuleWorkspace moduleId={moduleId} version={selectedVersion} project={project} setProject={setProject} onClose={()=>setSelected('')}/>} 
    </div>
  </div>;
}

export default function App(){return <ReactFlowProvider><Workflow/></ReactFlowProvider>}
