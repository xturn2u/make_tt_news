import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, DragEvent } from 'react';
import { addEdge, applyEdgeChanges, applyNodeChanges, Background, Controls, Handle, MiniMap, Position, ReactFlow, ReactFlowProvider, useReactFlow, type Connection, type Edge, type EdgeChange, type Node, type NodeChange, type NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './research-overrides.css';
import { ExternalLink, GripVertical, Play, Search, Settings2 } from 'lucide-react';
import { ModuleWorkspace } from './components/ModuleWorkspace';
import { availableVersionKeys, emptyProject, type NewsPackage, type ProjectAsset, type ProjectState, type VersionKey, uid } from './domain/project';
import { generatePackageAssets } from './services/generatedAssets';
import { searchTopLinks } from './services/research';

type ModuleId='json-input'|'news-package'|'headline'|'research'|'assets'|'studio'|'img2vid';
type NodeData={moduleId:ModuleId;label:string;description:string;detail?:string;color:string;icon:string;version?:VersionKey;shared?:boolean;optional?:boolean;assetCount?:number;voiceoverName?:string;researchStatus?:string};
type LinkNodeData={label:string;url:string;kind:'image'|'result'|'loading'|'error';version:VersionKey};
type ModuleDef=Omit<NodeData,'version'|'shared'|'optional'|'detail'|'assetCount'|'voiceoverName'|'researchStatus'>&{category:'Flow'|'Optional'|'Tool';versioned?:boolean;singleton?:boolean};

const modules:ModuleDef[]=[
  {moduleId:'json-input',label:'JSON Input',description:'Newspaket importieren',color:'#0ea5e9',icon:'{}',category:'Flow',singleton:true},
  {moduleId:'news-package',label:'Newspaket',description:'Text & Paketdaten',color:'#7c3aed',icon:'N',category:'Flow',versioned:true},
  {moduleId:'headline',label:'Schlagzeile',description:'Generator & Zeitungsausschnitte',color:'#ef4444',icon:'H',category:'Flow',versioned:true},
  {moduleId:'studio',label:'Studio',description:'Timeline & Produktion',color:'#111827',icon:'S',category:'Flow',versioned:true},
  {moduleId:'assets',label:'Assets',description:'Medienbibliothek',color:'#16a34a',icon:'A',category:'Tool',singleton:true},
  {moduleId:'research',label:'Recherche',description:'Startet für alle Versionen',color:'#2563eb',icon:'R',category:'Tool',singleton:true},
  {moduleId:'img2vid',label:'Img2Vid',description:'Optionaler KI-Clip',color:'#db2777',icon:'V',category:'Optional'},
];
const byId=Object.fromEntries(modules.map(m=>[m.moduleId,m])) as Record<ModuleId,ModuleDef>;

function nodeData(moduleId:ModuleId,version?:VersionKey,shared=false,optional=false,detail=''):NodeData{
  const d=byId[moduleId];
  return {moduleId,label:version?`${d.label} ${version.toUpperCase()}`:shared?`${d.label} · gemeinsam`:optional?`${d.label} · optional`:d.label,description:shared?'Für alle Versionen verfügbar':optional?'Nicht Teil des Produktionsflows':d.description,detail,color:d.color,icon:d.icon,version,shared,optional};
}

function FlowNode({data,selected}:NodeProps<Node<NodeData>>){
  const isStudio=data.moduleId==='studio'&&Boolean(data.version);
  const isNews=data.moduleId==='news-package';
  return <div
    className={`flow-node ${selected?'selected':''} ${data.shared?'shared-node':''} ${data.optional?'optional-node':''} ${isStudio?'studio-drop-node':''}`}
    style={{'--node':data.color} as CSSProperties}
    onDragOver={event=>{if(isStudio&&event.dataTransfer.types.includes('Files')){event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect='copy'}}}
    onDrop={event=>{if(!isStudio||!data.version||!event.dataTransfer.files.length)return;event.preventDefault();event.stopPropagation();window.dispatchEvent(new CustomEvent('studio-voiceover-drop',{detail:{version:data.version,file:event.dataTransfer.files[0]}}))}}
  >
    <Handle id="flow-left" type="target" position={Position.Left}/>
    {isNews&&<><Handle id="research-top" className="research-branch-handle" type="source" position={Position.Top}/><Handle id="research-bottom" className="research-branch-handle" type="source" position={Position.Bottom}/></>}
    <div className="node-icon">{data.icon}</div>
    <div className="node-text"><strong>{data.label}</strong><span>{data.description}</span>{data.detail&&<small className="node-detail" title={data.detail}>{data.detail}</small>}{data.voiceoverName&&<small className="voiceover-node-info">🎙 {data.voiceoverName}</small>}{data.researchStatus&&<small className="research-node-info">{data.researchStatus}</small>}</div>
    {data.version&&<em className="version-chip">{data.version.toUpperCase()}</em>}{data.shared&&!data.optional&&<em className="shared-chip">GLOBAL</em>}{data.optional&&<em className="optional-chip">OPTIONAL</em>}{data.moduleId==='assets'&&typeof data.assetCount==='number'&&<em className="asset-count-chip">{data.assetCount}</em>}
    <Handle id="flow-right" type="source" position={Position.Right}/>
  </div>;
}

function ResearchLinkNode({data}:NodeProps<Node<LinkNodeData>>){
  const disabled=!data.url;
  return <div className={`research-link-node ${data.kind}`}>
    <Handle type="target" position={data.kind==='image'?Position.Bottom:Position.Top}/>
    {disabled?<span>{data.label}</span>:<a href={data.url} target="_blank" rel="noreferrer"><ExternalLink size={11}/><span>{data.label}</span></a>}
  </div>;
}

function baseGraph(project:ProjectState){return{nodes:[
  {id:'research-global',type:'module',position:{x:30,y:35},data:{...nodeData('research',undefined,true,true),detail:'Noch nicht gestartet'}},
  {id:'assets-shared',type:'module',position:{x:650,y:35},data:{...nodeData('assets',undefined,true),assetCount:project.assets.length,detail:`${project.assets.length} Assets gesamt`}},
  {id:'input',type:'module',position:{x:45,y:330},data:nodeData('json-input')},
] as Node<NodeData>[],edges:[] as Edge[]}}

function graphForProject(project:ProjectState){
  const pkg=project.newsPackage;
  const versions=availableVersionKeys(pkg);
  if(!versions.length)return baseGraph(project);
  const rowGap=250;
  const firstY=190;
  const middleY=firstY+((versions.length-1)*rowGap)/2;
  const researchDone=versions.filter(v=>project.research[v]?.status==='done').length;
  const nodes:Array<Node<NodeData>|Node<LinkNodeData>>=[
    {id:'research-global',type:'module',position:{x:30,y:35},data:{...nodeData('research',undefined,true,true),detail:`${researchDone}/${versions.length} Versionen recherchiert`,researchStatus:researchDone===versions.length?'Recherche bereit':'Workflow starten'}},
    {id:'assets-shared',type:'module',position:{x:650,y:35},data:{...nodeData('assets',undefined,true),assetCount:project.assets.length,detail:`${project.assets.length} Assets gesamt`}},
    {id:'input',type:'module',position:{x:45,y:middleY},data:nodeData('json-input')},
  ];
  const edges:Edge[]=[];
  versions.forEach((version,index)=>{
    const y=firstY+index*rowGap;
    const header=pkg?.versions[version]?.header?.trim()||'';
    const flow=project.versionFlows[version];
    const voice=flow?.voiceoverAssetId?project.assets.find(asset=>asset.id===flow.voiceoverAssetId):undefined;
    const research=project.research[version];
    const ids={news:`news-${version}`,headline:`headline-${version}`,studio:`studio-${version}`};
    nodes.push(
      {id:ids.news,type:'module',position:{x:300,y},data:{...nodeData('news-package',version,false,false,header),researchStatus:research?.status==='done'?`${research.links.length} Recherche-Links`:research?.status==='searching'?'Recherche läuft …':research?.status==='error'?'Recherche prüfen':''}},
      {id:ids.headline,type:'module',position:{x:610,y},data:nodeData('headline',version,false,false,header)},
      {id:ids.studio,type:'module',position:{x:930,y},data:{...nodeData('studio',version,false,false,header),voiceoverName:voice?.name}},
    );
    edges.push(
      {id:`e-input-${version}`,source:'input',sourceHandle:'flow-right',target:ids.news,targetHandle:'flow-left',type:'smoothstep'},
      {id:`e-research-${version}`,source:'research-global',sourceHandle:'flow-right',target:ids.news,targetHandle:'flow-left',type:'smoothstep',animated:research?.status==='searching',style:{stroke:'#93c5fd',strokeDasharray:'5 5'}},
      {id:`e-news-headline-${version}`,source:ids.news,sourceHandle:'flow-right',target:ids.headline,targetHandle:'flow-left',type:'smoothstep'},
      {id:`e-headline-studio-${version}`,source:ids.headline,sourceHandle:'flow-right',target:ids.studio,targetHandle:'flow-left',type:'smoothstep'},
      {id:`e-assets-studio-${version}`,source:'assets-shared',sourceHandle:'flow-right',target:ids.studio,targetHandle:'flow-left',type:'smoothstep',animated:true,style:{stroke:'#86efac',strokeDasharray:'5 5'}},
    );
    if(research&&research.status!=='idle'){
      const imageUrl=research.imageSearchUrl||`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(research.query||header)}`;
      nodes.push({id:`image-search-${version}`,type:'researchLink',position:{x:315,y:y-38},data:{label:'Google Bildsuche',url:imageUrl,kind:'image',version}});
      edges.push({id:`e-image-${version}`,source:ids.news,sourceHandle:'research-top',target:`image-search-${version}`,type:'smoothstep',style:{stroke:'#60a5fa'}});
      if(research.status==='searching'){
        nodes.push({id:`research-loading-${version}`,type:'researchLink',position:{x:315,y:y+80},data:{label:'Recherche läuft …',url:'',kind:'loading',version}});
        edges.push({id:`e-loading-${version}`,source:ids.news,sourceHandle:'research-bottom',target:`research-loading-${version}`,type:'smoothstep',animated:true,style:{stroke:'#60a5fa'}});
      }else if(research.status==='error'){
        nodes.push({id:`research-error-${version}`,type:'researchLink',position:{x:315,y:y+80},data:{label:'Suche nicht verfügbar',url:'',kind:'error',version}});
        edges.push({id:`e-error-${version}`,source:ids.news,sourceHandle:'research-bottom',target:`research-error-${version}`,type:'smoothstep',style:{stroke:'#f87171'}});
      }else{
        research.links.slice(0,3).forEach((link,linkIndex)=>{
          const id=`research-${version}-${linkIndex}`;
          nodes.push({id,type:'researchLink',position:{x:315,y:y+80+linkIndex*34},data:{label:link.title,url:link.url,kind:'result',version}});
          edges.push({id:`e-${id}`,source:ids.news,sourceHandle:'research-bottom',target:id,type:'smoothstep',style:{stroke:'#60a5fa'}});
        });
      }
    }
  });
  return{nodes:nodes as Node[],edges};
}

function Workflow(){
  const [project,setProject]=useState<ProjectState>(emptyProject());
  const start=graphForProject(project);
  const [nodes,setNodes]=useState<Node[]>(start.nodes);
  const [edges,setEdges]=useState<Edge[]>(start.edges);
  const [selected,setSelected]=useState('input');
  const [query,setQuery]=useState('');
  const [researching,setResearching]=useState(false);
  const reactFlow=useReactFlow();
  const wrapper=useRef<HTMLDivElement>(null);
  const nodeTypes=useMemo(()=>({module:FlowNode,researchLink:ResearchLinkNode}),[]);
  const versions=useMemo(()=>availableVersionKeys(project.newsPackage),[project.newsPackage]);
  const totalClips=useMemo(()=>versions.reduce((sum,key)=>sum+(project.versionFlows[key]?.timeline.length||0),0),[versions,project.versionFlows]);

  const refreshGraph=useCallback((nextProject:ProjectState)=>{
    const next=graphForProject(nextProject);setNodes(next.nodes);setEdges(next.edges);
  },[]);

  useEffect(()=>{if(project.workflowRevision===0)return;refreshGraph(project);const first=availableVersionKeys(project.newsPackage)[0];setSelected(first?`news-${first}`:'input');window.setTimeout(()=>reactFlow.fitView({padding:.12,duration:350}),0)},[project.workflowRevision]);
  useEffect(()=>{if(project.workflowRevision===0)return;refreshGraph(project)},[project.assets,project.versionFlows,project.research,project.newsPackage]);

  useEffect(()=>{
    const handler=(event:Event)=>{
      const detail=(event as CustomEvent<{version:VersionKey;file:File}>).detail;
      if(!detail?.version||!detail.file)return;
      const file=detail.file;
      if(!file.type.startsWith('audio/')&&!/\.(mp3|wav|m4a|aac|ogg)$/i.test(file.name)){window.alert('Bitte eine Audio-Datei als Voiceover verwenden.');return;}
      setProject(current=>{
        const existing=current.versionFlows[detail.version]?.voiceoverAssetId;
        if(existing){const old=current.assets.find(asset=>asset.id===existing);if(old?.url.startsWith('blob:'))URL.revokeObjectURL(old.url)}
        const asset:ProjectAsset={id:uid('voiceover'),kind:'audio',name:file.name,url:URL.createObjectURL(file),mime:file.type,size:file.size,source:'voiceover',version:detail.version};
        return {...current,assets:[asset,...current.assets.filter(item=>item.id!==existing)],versionFlows:{...current.versionFlows,[detail.version]:{timeline:current.versionFlows[detail.version]?.timeline||[],voiceoverAssetId:asset.id}}};
      });
    };
    window.addEventListener('studio-voiceover-drop',handler);return()=>window.removeEventListener('studio-voiceover-drop',handler);
  },[]);

  const runResearch=async()=>{
    if(!project.newsPackage||!versions.length)return;
    setResearching(true);
    setProject(current=>({...current,research:Object.fromEntries(versions.map(version=>{const currentState=current.research[version];const term=currentState?.query||current.newsPackage?.versions[version]?.header||current.newsPackage?.meta.topic||'';return[version,{query:term,imageSearchUrl:`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(term)}`,links:[],status:'searching' as const}]}))}));
    try{
      const generated=await generatePackageAssets(project.newsPackage);
      setProject(current=>{
        const additions:ProjectAsset[]=[];
        for(const asset of generated){
          const exists=current.assets.some(item=>item.source===asset.source&&item.version===asset.version&&item.caption===asset.caption);
          if(exists){if(asset.url.startsWith('blob:'))URL.revokeObjectURL(asset.url)}else additions.push(asset);
        }
        return additions.length?{...current,assets:[...additions,...current.assets]}:current;
      });
      await Promise.all(versions.map(async version=>{
        const term=project.research[version]?.query||project.newsPackage?.versions[version]?.header||project.newsPackage?.meta.topic||'';
        try{const links=await searchTopLinks(term);setProject(current=>({...current,research:{...current.research,[version]:{query:term,imageSearchUrl:`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(term)}`,links,status:'done'}}}))}
        catch(error){setProject(current=>({...current,research:{...current.research,[version]:{query:term,imageSearchUrl:`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(term)}`,links:[],status:'error',error:error instanceof Error?error.message:String(error)}}}))}
      }));
    }finally{setResearching(false)}
  };

  const selectedNode=nodes.find(n=>n.id===selected) as Node<NodeData>|undefined;
  const moduleId=selectedNode?.data?.moduleId;
  const selectedVersion=selectedNode?.data?.version;
  const filtered=modules.filter(m=>m.label.toLowerCase().includes(query.toLowerCase())||m.description.toLowerCase().includes(query.toLowerCase()));
  const openNode=(node:Node<NodeData>)=>{if(node.data.version)setProject(p=>({...p,activeVersion:node.data.version!}));setSelected(node.id)};

  const onDrop=useCallback((event:DragEvent)=>{
    event.preventDefault();
    if(event.dataTransfer.files.length)return;
    const id=event.dataTransfer.getData('application/module') as ModuleId;
    if(!id||!byId[id]||!wrapper.current)return;
    const def=byId[id];
    if(def.singleton&&nodes.some(n=>(n.data as NodeData).moduleId===id))return;
    const position=reactFlow.screenToFlowPosition({x:event.clientX,y:event.clientY});
    const version=def.versioned&&project.newsPackage?project.activeVersion:undefined;
    const detail=version?project.newsPackage?.versions[version]?.header||'':'';
    const node:Node<NodeData>={id:`${id}-${version||'tool'}-${Date.now()}`,type:'module',position,data:nodeData(id,version,id==='assets',def.category!=='Flow',detail)};
    setNodes(cur=>[...cur,node]);setSelected(node.id);
  },[nodes,reactFlow,project.activeVersion,project.newsPackage]);

  const onConnect=(c:Connection)=>{if(!c.source||!c.target)return;const source=nodes.find(n=>n.id===c.source) as Node<NodeData>|undefined;const target=nodes.find(n=>n.id===c.target) as Node<NodeData>|undefined;if(source?.type==='researchLink'||target?.type==='researchLink')return;setEdges(cur=>addEdge({...c,type:'smoothstep'},cur))};

  return <div className="app-shell"><header className="appbar"><div className="brand"><span className="brandmark">PM</span><div><strong>Projektmanagement</strong><small>{project.newsPackage?.meta.topic||'Neues Projekt'}</small></div></div><div className="project-meta">{project.newsPackage?<><span className="status-dot ok"/>{versions.length} Flow{versions.length===1?'':'s'} · {project.assets.length} Assets · {totalClips} Clips</>:<><span className="status-dot"/>JSON importieren, um zu starten</>}</div><button className="workflow-start" disabled={!project.newsPackage||researching} onClick={()=>void runResearch()}><Play size={15}/>{researching?'Workflow läuft …':'Workflow starten'}</button><button className="ghost"><Settings2 size={16}/>Tools</button></header><div className="work-area">
    <aside className="module-library"><div className="library-title"><b>Bausteine</b><span>Drag & Drop</span></div><div className="library-search"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Suchen…"/></div>{(['Flow','Tool','Optional'] as const).map(cat=><section key={cat}><h4>{cat==='Tool'?'Werkzeuge':cat}</h4>{filtered.filter(m=>m.category===cat).map(m=>{const existing=nodes.find(n=>(n.data as NodeData).moduleId===m.moduleId&&(m.versioned?(n.data as NodeData).version===project.activeVersion:true));return <button className={`module-item ${cat==='Tool'?'tool-item':''}`} draggable={cat!=='Tool'} key={m.moduleId} onDragStart={e=>{if(cat==='Tool')return;e.dataTransfer.setData('application/module',m.moduleId);e.dataTransfer.effectAllowed='move'}} onClick={()=>{if(existing&&existing.type==='module')openNode(existing as Node<NodeData>)}}>{cat!=='Tool'&&<GripVertical size={14}/>}<i style={{background:m.color}}>{m.icon}</i><div><strong>{m.label}</strong><span>{m.description}</span></div></button>})}</section>)}</aside>
    <main ref={wrapper} className="flow-canvas" onDrop={onDrop} onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect='move'}}><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={(c:NodeChange[])=>setNodes(n=>applyNodeChanges(c,n))} onEdgesChange={(c:EdgeChange[])=>setEdges(e=>applyEdgeChanges(c,e))} onConnect={onConnect} onNodeClick={(_,n)=>{if(n.type==='module')openNode(n as Node<NodeData>)}} fitView minZoom={.25} maxZoom={1.5} deleteKeyCode={['Backspace','Delete']}><Background gap={22} size={1}/><Controls showInteractive={false}/><MiniMap pannable zoomable nodeColor={n=>n.type==='researchLink'?'#93c5fd':((n.data as NodeData).color||'#94a3b8')}/></ReactFlow><div className="canvas-hint"><span>Voiceover-Datei direkt auf Studio V1/V2/V3 ziehen · Recherche und Start-Assets entstehen über „Workflow starten“</span></div></main>
    {moduleId&&<ModuleWorkspace moduleId={moduleId} version={selectedVersion} project={project} setProject={setProject} onClose={()=>setSelected('')}/>} 
  </div></div>;
}
export default function App(){return <ReactFlowProvider><Workflow/></ReactFlowProvider>}
