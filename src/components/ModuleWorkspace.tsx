import { useEffect, useRef, useState } from 'react';
import { Download, ExternalLink, FileJson, ImagePlus, Search, Trash2, Upload, X } from 'lucide-react';
import type { AssetKind, NewsVersion, ProjectAsset, ProjectState, TimelineClip, TimelineLane, VersionKey } from '../domain/project';
import { availableVersionKeys, createVersionFlows, parsePackageJson, uid } from '../domain/project';

type Props = {
  moduleId: string;
  version?: VersionKey;
  project: ProjectState;
  setProject: React.Dispatch<React.SetStateAction<ProjectState>>;
  onClose: () => void;
};

type SharedProps = Omit<Props, 'moduleId' | 'onClose' | 'version'>;
type VersionProps = SharedProps & { version: VersionKey };

const laneLabels: Record<TimelineLane, string> = {
  banner: 'Banner', main: 'Main', broll: 'B-Roll', headline: 'Headline', text: 'Text', sound: 'Sound',
};

function Header({ title, subtitle, onClose }: { title: string; subtitle: string; onClose: () => void }) {
  return <div className="workspace-head"><div><h2>{title}</h2><p>{subtitle}</p></div><button className="icon-btn" onClick={onClose}><X size={18}/></button></div>;
}

function JsonImport({ project, setProject }: SharedProps) {
  const [json, setJson] = useState('');
  const [state, setState] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const apply = (value = json) => {
    try {
      const newsPackage = parsePackageJson(value);
      const versions = availableVersionKeys(newsPackage);
      const first = versions[0] || 'v1';
      setProject(current => ({
        ...current,
        newsPackage,
        activeVersion: first,
        versionFlows: createVersionFlows(newsPackage),
        workflowRevision: current.workflowRevision + 1,
      }));
      setState(`✓ ${newsPackage.meta.topic} · ${versions.length} Version${versions.length === 1 ? '' : 'en'} · ${versions.length} Flow${versions.length === 1 ? '' : 's'} erstellt`);
    } catch (error) {
      setState(error instanceof Error ? error.message : String(error));
    }
  };

  return <div className="workspace-section">
    <div className="callout"><FileJson size={18}/><div><b>JSON ist der Projekteinstieg</b><span>Jede im Paket vorhandene Version erzeugt automatisch einen eigenen Produktionsstrang.</span></div></div>
    <textarea className="json-editor" value={json} onChange={e=>setJson(e.target.value)} placeholder={'{\n  "package": {\n    "source_url": "https://…",\n    "meta": { "topic": "…", "breaking": false },\n    "versions": { "v1": {}, "v2": {}, "v3": {} }\n  }\n}'}/>
    <div className="action-row"><button className="primary" onClick={()=>apply()}>JSON importieren</button><button onClick={()=>fileRef.current?.click()}><Upload size={15}/> Datei wählen</button></div>
    <input ref={fileRef} hidden type="file" accept="application/json,.json" onChange={async e=>{const f=e.target.files?.[0];if(!f)return;const value=await f.text();setJson(value);apply(value);}}/>
    {state&&<div className={`message ${state.startsWith('✓')?'ok':'error'}`}>{state}</div>}
    {project.newsPackage&&<div className="summary-card"><span>Aktuelles Paket</span><strong>{project.newsPackage.meta.topic}</strong><small>{availableVersionKeys(project.newsPackage).map(v=>v.toUpperCase()).join(' · ')}</small></div>}
  </div>;
}

function NewspackageWorkspace({ project, setProject, version }: VersionProps) {
  const pkg=project.newsPackage;
  const data=pkg?.versions[version];
  if(!pkg||!data)return <Empty text={`${version.toUpperCase()} ist im importierten Paket nicht vorhanden.`}/>;

  const patch=(next:Partial<NewsVersion>)=>setProject(current=>{
    const currentVersion=current.newsPackage?.versions[version];
    if(!current.newsPackage||!currentVersion)return current;
    return {...current,newsPackage:{...current.newsPackage,versions:{...current.newsPackage.versions,[version]:{...currentVersion,...next}}}};
  });
  const words=data.speech_text.trim().split(/\s+/).filter(Boolean).length;

  return <div className="workspace-section">
    <div className="version-context"><b>{version.toUpperCase()}</b><span>Eigener Produktionsstrang</span></div>
    <div className="field-grid">
      <label className="wide">Header<input value={data.header} onChange={e=>patch({header:e.target.value})}/></label>
      <label className="wide">Sprechtext <span>{words} Wörter</span><textarea className="tall" value={data.speech_text} onChange={e=>patch({speech_text:e.target.value})}/></label>
      <label className="wide">Beschreibung<textarea value={data.description} onChange={e=>patch({description:e.target.value})}/></label>
      <label>Zeile 1<input value={data.triple_headline.line1} onChange={e=>patch({triple_headline:{...data.triple_headline,line1:e.target.value}})}/></label>
      <label>Zeile 2<input value={data.triple_headline.line2} onChange={e=>patch({triple_headline:{...data.triple_headline,line2:e.target.value}})}/></label>
      <label className="wide">Zeile 3<input value={data.triple_headline.line3} onChange={e=>patch({triple_headline:{...data.triple_headline,line3:e.target.value}})}/></label>
      <label className="wide">Bildprompt<textarea value={data.image_prompt} onChange={e=>patch({image_prompt:e.target.value})}/></label>
      <label className="wide">POV / Visual<textarea value={data.pov_visual.description} onChange={e=>patch({pov_visual:{...data.pov_visual,description:e.target.value}})}/></label>
      <label className="wide">Hashtags<input value={data.hashtags.join(' ')} onChange={e=>patch({hashtags:e.target.value.split(/\s+/).filter(Boolean).slice(0,5)})}/></label>
    </div>
  </div>;
}

function HeadlineWorkspace({ project, setProject, version }: VersionProps) {
  const pkg=project.newsPackage;
  const data=pkg?.versions[version];
  const [style,setStyle]=useState<'pressespiegel'|'pressepunkt'>('pressespiegel');
  const canvas=useRef<HTMLCanvasElement>(null);

  useEffect(()=>{
    const c=canvas.current;if(!c||!data)return;
    const x=c.getContext('2d');if(!x)return;
    x.clearRect(0,0,c.width,c.height);
    x.fillStyle=style==='pressespiegel'?'#07111f':'#f7f4ee';x.fillRect(0,0,c.width,c.height);
    x.textAlign='center';x.fillStyle=style==='pressespiegel'?'#ffcc00':'#111827';x.font='700 36px Arial';x.fillText(data.triple_headline.line1.toUpperCase(),540,360);
    x.fillStyle=style==='pressespiegel'?'white':'#b91c1c';x.font='900 76px Arial';wrapText(x,data.triple_headline.line2.toUpperCase(),540,530,850,86);
    x.fillStyle=style==='pressespiegel'?'#f3f4f6':'#111827';x.font='700 38px Arial';wrapText(x,data.triple_headline.line3,540,780,850,48);
  },[data,style]);

  if(!pkg||!data)return <Empty text={`${version.toUpperCase()} ist nicht verfügbar.`}/>;
  const save=async()=>{const c=canvas.current;if(!c)return;const blob=await new Promise<Blob|null>(resolve=>c.toBlob(resolve,'image/png'));if(!blob)return;const asset:ProjectAsset={id:uid('headline'),kind:'headline',name:`headline-${version}.png`,url:URL.createObjectURL(blob),mime:'image/png',size:blob.size,source:'headline',version};setProject(current=>({...current,assets:[...current.assets,asset]}));};

  return <div className="workspace-section">
    <div className="version-context"><b>{version.toUpperCase()}</b><span>Erzeugte Headline wird als gemeinsames Asset gespeichert</span></div>
    <div className="segmented"><button className={style==='pressespiegel'?'active':''} onClick={()=>setStyle('pressespiegel')}>Pressespiegel</button><button className={style==='pressepunkt'?'active':''} onClick={()=>setStyle('pressepunkt')}>Pressepunkt</button></div>
    <div className="headline-preview"><canvas ref={canvas} width="1080" height="1350"/></div>
    <div className="action-row"><button className="primary" onClick={save}>Als gemeinsames Asset speichern</button><button onClick={()=>downloadCanvas(canvas.current,`headline-${version}.png`)}><Download size={15}/>PNG</button></div>
  </div>;
}

function wrapText(ctx:CanvasRenderingContext2D,text:string,x:number,y:number,max:number,line:number){const words=text.split(/\s+/);let row='';let yy=y;for(const word of words){const test=row?`${row} ${word}`:word;if(ctx.measureText(test).width>max&&row){ctx.fillText(row,x,yy);row=word;yy+=line}else row=test}if(row)ctx.fillText(row,x,yy)}
function downloadCanvas(c:HTMLCanvasElement|null,name:string){if(!c)return;const a=document.createElement('a');a.download=name;a.href=c.toDataURL('image/png');a.click()}

function ResearchWorkspace({ project, version }: Omit<VersionProps,'setProject'>) {
  const pkg=project.newsPackage;
  const data=pkg?.versions[version];
  const [platform,setPlatform]=useState('google');
  const [query,setQuery]=useState('');
  const [url,setUrl]=useState('');
  const fallback=data?.header||pkg?.meta.topic||'';
  const search=()=>{const term=encodeURIComponent(query||fallback);let target='https://www.google.com/search?q='+term;if(platform==='images')target='https://www.google.com/search?tbm=isch&q='+term;if(platform==='x')target='https://x.com/search?q='+term+'&src=typed_query';if(platform==='youtube')target='https://www.youtube.com/results?search_query='+term;if(platform==='tiktok')target='https://www.tiktok.com/search?q='+term;window.open(target,'_blank','noopener')};
  const downloader=async()=>{if(!url)return;try{await navigator.clipboard.writeText(url)}catch{}window.open('https://cobalt.tools/','_blank','noopener')};

  return <div className="workspace-section">
    <div className="version-context"><b>{version.toUpperCase()}</b><span>{data?.header||'Recherche-Strang'}</span></div>
    <label>Suchbegriff<input value={query} onChange={e=>setQuery(e.target.value)} placeholder={fallback||'Suchbegriff'}/></label>
    <div className="segmented wrap">{[['google','Google'],['x','X'],['youtube','Shorts'],['tiktok','TikTok'],['images','Bilder']].map(([value,label])=><button key={value} className={platform===value?'active':''} onClick={()=>setPlatform(value)}>{label}</button>)}</div>
    <button className="primary full" onClick={search}><Search size={16}/>Suche öffnen</button><hr/>
    <label>Recherche-Video herunterladen<input value={url} onChange={e=>setUrl(e.target.value)} placeholder="Video-Link einfügen"/></label>
    <button className="full" onClick={downloader}><ExternalLink size={16}/>Link kopieren & Downloader öffnen</button>
  </div>;
}

function AssetsWorkspace({ project, setProject }: SharedProps) {
  const [filter,setFilter]=useState<'all'|AssetKind>('all');
  const [search,setSearch]=useState('');
  const file=useRef<HTMLInputElement>(null);
  const visible=project.assets.filter(asset=>(filter==='all'||asset.kind===filter)&&asset.name.toLowerCase().includes(search.toLowerCase()));
  const addFiles=(files:FileList|null)=>{if(!files)return;const next=[...files].map(f=>({id:uid('asset'),kind:(f.type.startsWith('video')?'video':f.type.startsWith('audio')?'audio':'image') as AssetKind,name:f.name,url:URL.createObjectURL(f),mime:f.type,size:f.size,source:'upload'}));setProject(current=>({...current,assets:[...current.assets,...next]}));};

  return <div className="workspace-section">
    <div className="callout shared-callout"><ImagePlus size={18}/><div><b>Gemeinsame Asset-Bibliothek</b><span>Alle Bilder, Videos, Audio-Dateien und erzeugten Headlines sind automatisch in jedem Versions-Flow verfügbar.</span></div></div>
    <div className="asset-toolbar"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Assets durchsuchen…"/><button onClick={()=>file.current?.click()}><ImagePlus size={16}/>Medien hinzufügen</button><input ref={file} hidden multiple type="file" accept="image/*,video/*,audio/*" onChange={e=>addFiles(e.target.files)}/></div>
    <div className="filter-row">{(['all','image','video','headline','banner','audio','export'] as const).map(key=><button key={key} className={filter===key?'active':''} onClick={()=>setFilter(key)}>{key==='all'?'Alle':key} <span>{key==='all'?project.assets.length:project.assets.filter(a=>a.kind===key).length}</span></button>)}</div>
    <div className="asset-grid">{visible.map(asset=><AssetCard key={asset.id} asset={asset} onDelete={()=>setProject(current=>({...current,assets:current.assets.filter(item=>item.id!==asset.id)}))}/>) }{!visible.length&&<Empty text="Noch keine passenden Assets vorhanden."/>}</div>
    <label>Projekt-Notizen<textarea value={project.notes} onChange={e=>setProject(current=>({...current,notes:e.target.value}))} placeholder="Gemeinsame Hinweise für alle Versionen…"/></label>
  </div>;
}

function AssetCard({asset,onDelete}:{asset:ProjectAsset;onDelete:()=>void}){return <article className="asset-card"><div className="asset-media">{asset.kind==='video'?<video src={asset.url} muted/>:asset.kind==='audio'?<div className="audio-icon">♪</div>:<img src={asset.url} alt=""/>}<span>{asset.version?`${asset.kind} · ${asset.version.toUpperCase()}`:asset.kind}</span><button onClick={onDelete}><Trash2 size={13}/></button></div><b>{asset.name}</b><small>{asset.size?`${(asset.size/1048576).toFixed(1)} MB`:asset.source}</small></article>}

function StudioWorkspace({project,setProject,version}:VersionProps){
  const [selected,setSelected]=useState<string>('');
  const [dragAsset,setDragAsset]=useState<string>('');
  const clips=project.versionFlows[version]?.timeline||[];
  const total=Math.max(30,...clips.map(clip=>clip.start+clip.duration));
  const selectedClip=clips.find(clip=>clip.id===selected);
  const selectedAsset=project.assets.find(asset=>asset.id===selectedClip?.assetId);

  const setTimeline=(updater:(current:TimelineClip[])=>TimelineClip[])=>setProject(current=>({
    ...current,
    versionFlows:{
      ...current.versionFlows,
      [version]:{timeline:updater(current.versionFlows[version]?.timeline||[])},
    },
  }));
  const addClip=(lane:TimelineLane,assetId?:string)=>{const asset=project.assets.find(item=>item.id===assetId);const start=Math.max(0,...clips.filter(clip=>clip.lane===lane).map(clip=>clip.start+clip.duration));const clip:TimelineClip={id:uid('clip'),lane,assetId,label:asset?.name||laneLabels[lane],start,duration:lane==='headline'||lane==='banner'?6:10};setTimeline(current=>[...current,clip]);setSelected(clip.id)};
  const patchClip=(patch:Partial<TimelineClip>)=>setTimeline(current=>current.map(clip=>clip.id===selected?{...clip,...patch}:clip));

  return <div className="studio-workspace">
    <div className="version-context studio-version"><b>{version.toUpperCase()}</b><span>Eigene Timeline · gemeinsame Assets</span></div>
    <div className="studio-preview"><div className="phone-preview">{selectedAsset?(selectedAsset.kind==='video'?<video src={selectedAsset.url} controls/>:selectedAsset.kind==='audio'?<div className="phone-empty">Audio ausgewählt</div>:<img src={selectedAsset.url} alt=""/>):<div className="phone-empty">Timeline-Clip auswählen</div>}{selectedClip?.text&&<div className="phone-text">{selectedClip.text}</div>}</div><div className="studio-assets">{project.assets.slice(0,18).map(asset=><button key={asset.id} draggable onDragStart={()=>setDragAsset(asset.id)} title={asset.name}>{asset.kind==='video'?<video src={asset.url} muted/>:asset.kind==='audio'?<span>♪</span>:<img src={asset.url} alt=""/>}</button>)}</div></div>
    <div className="timeline"><div className="timeline-scale">0s <span>{Math.round(total/2)}s</span><span>{total}s</span></div>{(Object.keys(laneLabels) as TimelineLane[]).map(lane=><div className="lane" key={lane} onDragOver={e=>e.preventDefault()} onDrop={()=>{if(dragAsset)addClip(lane,dragAsset);setDragAsset('')}}><div className="lane-label"><button onClick={()=>addClip(lane)}>+</button>{laneLabels[lane]}</div><div className="lane-track">{clips.filter(clip=>clip.lane===lane).map(clip=><button key={clip.id} onClick={()=>setSelected(clip.id)} className={`clip ${selected===clip.id?'selected':''}`} style={{left:`${(clip.start/total)*100}%`,width:`${Math.max(5,(clip.duration/total)*100)}%`}}>{clip.label}</button>)}</div></div>)}</div>
    {selectedClip&&<div className="clip-editor"><b>{selectedClip.label}</b><label>Start<input type="number" value={selectedClip.start} min={0} step={.5} onChange={e=>patchClip({start:Number(e.target.value)})}/></label><label>Dauer<input type="number" value={selectedClip.duration} min={1} step={.5} onChange={e=>patchClip({duration:Number(e.target.value)})}/></label>{selectedClip.lane==='text'&&<label>Text<input value={selectedClip.text||''} onChange={e=>patchClip({text:e.target.value})}/></label>}<button className="danger" onClick={()=>setTimeline(current=>current.filter(clip=>clip.id!==selected))}><Trash2 size={14}/>Clip löschen</button></div>}
  </div>;
}

function Img2VidWorkspace({project,setProject}:SharedProps){
  const images=project.assets.filter(asset=>['image','headline','banner'].includes(asset.kind));
  const [asset,setAsset]=useState('');
  const [model,setModel]=useState('bytedance/seedance-1-pro');
  const [prompt,setPrompt]=useState('Create a realistic video from this image while preserving the original frame exactly. Keep the camera locked off and static. Do not add new objects. Allow only subtle environmental motion.');
  const [duration,setDuration]=useState(5);
  const chosen=images.find(item=>item.id===asset);
  return <div className="workspace-section"><div className="callout shared-callout"><b>Gemeinsamer Asset-Produzent</b><span>Ein erzeugter Clip wird später ebenfalls in der gemeinsamen Asset-Bibliothek abgelegt und kann in jedem Flow verwendet werden.</span></div><label>Startbild<select value={asset} onChange={e=>setAsset(e.target.value)}><option value="">Asset wählen…</option>{images.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{chosen&&<img className="img2vid-preview" src={chosen.url} alt=""/>}<label>Videomodell<select value={model} onChange={e=>setModel(e.target.value)}><option value="bytedance/seedance-1-pro">Seedance 1 Pro</option><option value="wan-video/wan-2.2-i2v-fast">Wan 2.2 Fast</option><option value="kwaivgi/kling-v2.1">Kling v2.1</option><option value="prunaai/p-video">PrunaAI P-Video</option></select></label><label>Prompt<textarea className="tall" value={prompt} onChange={e=>setPrompt(e.target.value)}/></label><div className="field-grid"><label>Dauer<select value={duration} onChange={e=>setDuration(Number(e.target.value))}><option>5</option><option>10</option></select></label><label>Seitenverhältnis<select><option>Automatisch</option><option>9:16</option><option>16:9</option></select></label></div><div className="callout"><b>Development-Modus</b><span>Die Backend-Bridge wird separat angebunden; API-Schlüssel werden nicht im öffentlichen Frontend gespeichert.</span></div><button disabled={!chosen} className="primary full" onClick={()=>{if(!chosen)return;setProject(current=>({...current,notes:`${current.notes}\nImg2Vid: ${model}, ${duration}s, ${chosen.name}`.trim()}))}}>Job vorbereiten</button></div>;
}

function Empty({text}:{text:string}){return <div className="empty-state">{text}</div>}

export function ModuleWorkspace({moduleId,version,project,setProject,onClose}:Props){
  const activeVersion=version||project.activeVersion;
  const versionLabel=version?` · ${version.toUpperCase()}`:'';
  const defs:Record<string,[string,string,React.ReactNode]>={
    'json-input':['JSON Input','Paket importieren und Versions-Flows automatisch erzeugen.',<JsonImport project={project} setProject={setProject}/>],
    'news-package':[`Newspaket${versionLabel}`,'Paketdaten dieses Versions-Strangs bearbeiten.',<NewspackageWorkspace version={activeVersion} project={project} setProject={setProject}/>],
    'headline':[`Schlagzeile${versionLabel}`,'Dreizeiler dieser Version gestalten und als gemeinsames Asset speichern.',<HeadlineWorkspace version={activeVersion} project={project} setProject={setProject}/>],
    'research':[`Recherche${versionLabel}`,'Recherche für genau diesen Versions-Strang.',<ResearchWorkspace version={activeVersion} project={project}/>],
    'assets':['Assets · gemeinsam','Eine Medienbibliothek für alle Versions-Flows.',<AssetsWorkspace project={project} setProject={setProject}/>],
    'studio':[`Studio${versionLabel}`,'Eigene Timeline für diese Version; Assets werden gemeinsam genutzt.',<StudioWorkspace version={activeVersion} project={project} setProject={setProject}/>],
    'img2vid':['Img2Vid','Optionaler Produzent für gemeinsame Video-Assets.',<Img2VidWorkspace project={project} setProject={setProject}/>],
  };
  const definition=defs[moduleId]||['Modul','Keine Arbeitsfläche vorhanden.',<Empty text="Für dieses Modul ist noch keine Arbeitsfläche definiert."/>];
  return <aside className="workspace"><Header title={definition[0]} subtitle={definition[1]} onClose={onClose}/><div className="workspace-body">{definition[2]}</div></aside>;
}
