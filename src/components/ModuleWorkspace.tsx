import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, ExternalLink, FileJson, ImagePlus, Mic, Pause, Play, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import type { AssetKind, NewsPackage, ProjectAsset, ProjectState, TimelineClip, TimelineLane, VersionKey } from '../domain/project';
import { parsePackageJson, uid, versionKeys } from '../domain/project';

type Props = {
  moduleId: string;
  project: ProjectState;
  setProject: React.Dispatch<React.SetStateAction<ProjectState>>;
  onClose: () => void;
};

const laneLabels: Record<TimelineLane, string> = { banner: 'Banner', main: 'Main', broll: 'B-Roll', headline: 'Headline', text: 'Text', sound: 'Sound' };
const assetAccept: Record<AssetKind, string> = {
  image: 'image/*', video: 'video/*', audio: 'audio/*', headline: 'image/*', banner: 'image/*', export: 'video/*',
};

function Header({ title, subtitle, onClose }: { title: string; subtitle: string; onClose: () => void }) {
  return <div className="workspace-head"><div><h2>{title}</h2><p>{subtitle}</p></div><button className="icon-btn" onClick={onClose}><X size={18}/></button></div>;
}

function JsonImport({ project, setProject }: Omit<Props, 'moduleId' | 'onClose'>) {
  const [json, setJson] = useState('');
  const [state, setState] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const apply = (value = json) => {
    try {
      const newsPackage = parsePackageJson(value);
      setProject(p => ({ ...p, newsPackage, activeVersion: 'v1' }));
      setState(`✓ ${newsPackage.meta.topic} · 3 Versionen importiert`);
    } catch (error) { setState(error instanceof Error ? error.message : String(error)); }
  };
  return <div className="workspace-section">
    <div className="callout"><FileJson size={18}/><div><b>JSON ist der Projekteinstieg</b><span>Akzeptiert das exportierte Paket direkt oder als <code>{'{ "package": { … } }'}</code>.</span></div></div>
    <textarea className="json-editor" value={json} onChange={e=>setJson(e.target.value)} placeholder={'{\n  "package": {\n    "source_url": "https://…",\n    "meta": { "topic": "…", "breaking": false },\n    "versions": { "v1": {}, "v2": {}, "v3": {} }\n  }\n}'}/>
    <div className="action-row"><button className="primary" onClick={()=>apply()}>JSON importieren</button><button onClick={()=>fileRef.current?.click()}><Upload size={15}/> Datei wählen</button></div>
    <input ref={fileRef} hidden type="file" accept="application/json,.json" onChange={async e=>{const f=e.target.files?.[0]; if(!f)return; const value=await f.text(); setJson(value); apply(value);}}/>
    {state && <div className={`message ${state.startsWith('✓')?'ok':'error'}`}>{state}</div>}
    {project.newsPackage && <div className="summary-card"><span>Aktuelles Paket</span><strong>{project.newsPackage.meta.topic}</strong><small>{project.newsPackage.source_url}</small></div>}
  </div>;
}

function VersionTabs({ project, setProject }: Omit<Props, 'moduleId' | 'onClose'>) {
  return <div className="version-tabs">{versionKeys.map(v=><button key={v} className={project.activeVersion===v?'active':''} onClick={()=>setProject(p=>({...p,activeVersion:v}))}>{v.toUpperCase()}</button>)}</div>;
}

function NewspackageWorkspace({ project, setProject }: Omit<Props, 'moduleId' | 'onClose'>) {
  const pkg = project.newsPackage;
  if (!pkg) return <Empty text="Zuerst über JSON Input ein Newspaket importieren."/>;
  const key=project.activeVersion; const version=pkg.versions[key];
  const patch=(next: Partial<typeof version>)=>setProject(p=>{
    if(!p.newsPackage)return p;
    return {...p,newsPackage:{...p.newsPackage,versions:{...p.newsPackage.versions,[key]:{...p.newsPackage.versions[key],...next}}}};
  });
  const words=version.speech_text.trim().split(/\s+/).filter(Boolean).length;
  return <div className="workspace-section"><VersionTabs project={project} setProject={setProject}/>
    <div className="field-grid"><label className="wide">Header<input value={version.header} onChange={e=>patch({header:e.target.value})}/></label>
      <label className="wide">Sprechtext <span>{words} Wörter</span><textarea className="tall" value={version.speech_text} onChange={e=>patch({speech_text:e.target.value})}/></label>
      <label className="wide">Beschreibung<textarea value={version.description} onChange={e=>patch({description:e.target.value})}/></label>
      <label>Zeile 1<input value={version.triple_headline.line1} onChange={e=>patch({triple_headline:{...version.triple_headline,line1:e.target.value}})}/></label>
      <label>Zeile 2<input value={version.triple_headline.line2} onChange={e=>patch({triple_headline:{...version.triple_headline,line2:e.target.value}})}/></label>
      <label className="wide">Zeile 3<input value={version.triple_headline.line3} onChange={e=>patch({triple_headline:{...version.triple_headline,line3:e.target.value}})}/></label>
      <label className="wide">Bildprompt<textarea value={version.image_prompt} onChange={e=>patch({image_prompt:e.target.value})}/></label>
      <label className="wide">POV / Visual<textarea value={version.pov_visual.description} onChange={e=>patch({pov_visual:{...version.pov_visual,description:e.target.value}})}/></label>
      <label className="wide">Hashtags<input value={version.hashtags.join(' ')} onChange={e=>patch({hashtags:e.target.value.split(/\s+/).filter(Boolean).slice(0,5)})}/></label>
    </div>
    <PrompterRecorder project={project} setProject={setProject}/>
  </div>;
}

function PrompterRecorder({ project, setProject }: Omit<Props, 'moduleId' | 'onClose'>) {
  const text=project.newsPackage?.versions[project.activeVersion].speech_text||'';
  const [running,setRunning]=useState(false); const [recording,setRecording]=useState(false); const [wpm,setWpm]=useState(145);
  const [progress,setProgress]=useState(0); const recRef=useRef<MediaRecorder|null>(null); const chunks=useRef<Blob[]>([]);
  useEffect(()=>{ if(!running)return; const words=Math.max(1,text.split(/\s+/).length); const duration=(words/wpm)*60*1000; const start=performance.now(); let raf=0; const tick=(now:number)=>{const p=Math.min(1,(now-start)/duration);setProgress(p);if(p<1)raf=requestAnimationFrame(tick);else setRunning(false)};raf=requestAnimationFrame(tick);return()=>cancelAnimationFrame(raf);},[running,text,wpm]);
  const toggleRecording=async()=>{ if(recording){recRef.current?.stop();return;} try{const stream=await navigator.mediaDevices.getUserMedia({audio:true}); const rec=new MediaRecorder(stream);chunks.current=[];rec.ondataavailable=e=>{if(e.data.size)chunks.current.push(e.data)};rec.onstop=()=>{const blob=new Blob(chunks.current,{type:rec.mimeType||'audio/webm'}); const asset:ProjectAsset={id:uid('voice'),kind:'audio',name:`voice-${project.activeVersion}.webm`,url:URL.createObjectURL(blob),mime:blob.type,size:blob.size,source:'prompter'};setProject(p=>({...p,assets:[...p.assets,asset]}));stream.getTracks().forEach(t=>t.stop());setRecording(false)};recRef.current=rec;rec.start();setRecording(true);}catch{setRecording(false)} };
  return <div className="prompter-card"><div className="prompter-tools"><b>Prompter & Aufnahme</b><label>WPM <input type="number" value={wpm} min={60} max={240} onChange={e=>setWpm(Number(e.target.value)||145)}/></label></div>
    <div className="prompter-screen"><div style={{transform:`translateY(-${progress*72}%)`}}>{text||'Kein Sprechtext vorhanden.'}</div></div>
    <div className="action-row"><button onClick={()=>{setProgress(0);setRunning(v=>!v)}}>{running?<><Pause size={15}/>Pause</>:<><Play size={15}/>Prompter</>}</button><button className={recording?'danger':''} onClick={toggleRecording}><Mic size={15}/>{recording?'Aufnahme stoppen':'Aufnehmen'}</button></div>
  </div>;
}

function HeadlineWorkspace({ project, setProject }: Omit<Props, 'moduleId' | 'onClose'>) {
  const pkg=project.newsPackage; const [style,setStyle]=useState<'pressespiegel'|'pressepunkt'>('pressespiegel');
  const canvas=useRef<HTMLCanvasElement>(null); const version=pkg?.versions[project.activeVersion];
  useEffect(()=>{const c=canvas.current;if(!c||!version)return;const x=c.getContext('2d');if(!x)return;x.clearRect(0,0,c.width,c.height);x.fillStyle=style==='pressespiegel'?'#07111f':'#f7f4ee';x.fillRect(0,0,c.width,c.height);x.textAlign='center';x.fillStyle=style==='pressespiegel'?'#ffcc00':'#111827';x.font='700 36px Arial';x.fillText(version.triple_headline.line1.toUpperCase(),540,360);x.fillStyle=style==='pressespiegel'?'white':'#b91c1c';x.font='900 76px Arial';wrapText(x,version.triple_headline.line2.toUpperCase(),540,530,850,86);x.fillStyle=style==='pressespiegel'?'#f3f4f6':'#111827';x.font='700 38px Arial';wrapText(x,version.triple_headline.line3,540,780,850,48);},[version,style]);
  if(!pkg||!version)return <Empty text="Newspaket fehlt."/>;
  const save=async()=>{const c=canvas.current;if(!c)return;const blob=await new Promise<Blob|null>(r=>c.toBlob(r,'image/png'));if(!blob)return;const a:ProjectAsset={id:uid('headline'),kind:'headline',name:`headline-${project.activeVersion}.png`,url:URL.createObjectURL(blob),mime:'image/png',size:blob.size,source:'headline'};setProject(p=>({...p,assets:[...p.assets,a]}));};
  return <div className="workspace-section"><VersionTabs project={project} setProject={setProject}/><div className="segmented"><button className={style==='pressespiegel'?'active':''} onClick={()=>setStyle('pressespiegel')}>Pressespiegel</button><button className={style==='pressepunkt'?'active':''} onClick={()=>setStyle('pressepunkt')}>Pressepunkt</button></div><div className="headline-preview"><canvas ref={canvas} width="1080" height="1350"/></div><div className="action-row"><button className="primary" onClick={save}>Als Asset speichern</button><button onClick={()=>downloadCanvas(canvas.current,`headline-${project.activeVersion}.png`)}><Download size={15}/>PNG</button></div><div className="mini-grid">{versionKeys.map(k=><div key={k}><b>{k.toUpperCase()}</b><span>{pkg.versions[k].header}</span></div>)}</div></div>;
}

function wrapText(ctx:CanvasRenderingContext2D,text:string,x:number,y:number,max:number,line:number){const words=text.split(/\s+/);let row='';let yy=y;for(const w of words){const test=row?`${row} ${w}`:w;if(ctx.measureText(test).width>max&&row){ctx.fillText(row,x,yy);row=w;yy+=line}else row=test}if(row)ctx.fillText(row,x,yy)}
function downloadCanvas(c:HTMLCanvasElement|null,name:string){if(!c)return;const a=document.createElement('a');a.download=name;a.href=c.toDataURL('image/png');a.click()}

function ResearchWorkspace({ project }: Omit<Props, 'moduleId' | 'onClose' | 'setProject'>) {
  const pkg=project.newsPackage; const [platform,setPlatform]=useState('google');const [q,setQ]=useState('');const [url,setUrl]=useState('');
  const headers=versionKeys.map(k=>pkg?.versions[k].header).filter(Boolean) as string[];
  const search=()=>{const term=encodeURIComponent(q||headers[0]||pkg?.meta.topic||'');let target='https://www.google.com/search?q='+term;if(platform==='images')target='https://www.google.com/search?tbm=isch&q='+term;if(platform==='x')target='https://x.com/search?q='+term+'&src=typed_query';if(platform==='youtube')target='https://www.youtube.com/results?search_query='+term;if(platform==='tiktok')target='https://www.tiktok.com/search?q='+term;window.open(target,'_blank','noopener')};
  const downloader=async()=>{if(!url)return;try{await navigator.clipboard.writeText(url)}catch{}window.open('https://cobalt.tools/','_blank','noopener')};
  return <div className="workspace-section"><div className="summary-card"><span>Alternative News</span><strong>{pkg?.meta.topic||'Kein Paket geladen'}</strong><small>{headers.join(' · ')}</small></div><label>Suchbegriff<input value={q} onChange={e=>setQ(e.target.value)} placeholder={headers[0]||'Suchbegriff'}/></label><div className="segmented wrap">{[['google','Google'],['x','X'],['youtube','Shorts'],['tiktok','TikTok'],['images','Bilder']].map(([v,l])=><button key={v} className={platform===v?'active':''} onClick={()=>setPlatform(v)}>{l}</button>)}</div><button className="primary full" onClick={search}><Search size={16}/>Suche öffnen</button><hr/><label>Recherche-Video herunterladen<input value={url} onChange={e=>setUrl(e.target.value)} placeholder="Video-Link einfügen"/></label><button className="full" onClick={downloader}><ExternalLink size={16}/>Link kopieren & Downloader öffnen</button></div>;
}

function AssetsWorkspace({ project, setProject }: Omit<Props, 'moduleId' | 'onClose'>) {
  const [filter,setFilter]=useState<'all'|AssetKind>('all'); const [search,setSearch]=useState(''); const file=useRef<HTMLInputElement>(null);
  const visible=project.assets.filter(a=>(filter==='all'||a.kind===filter)&&a.name.toLowerCase().includes(search.toLowerCase()));
  const addFiles=(files:FileList|null)=>{if(!files)return;const next=[...files].map(f=>({id:uid('asset'),kind:(f.type.startsWith('video')?'video':f.type.startsWith('audio')?'audio':'image') as AssetKind,name:f.name,url:URL.createObjectURL(f),mime:f.type,size:f.size,source:'upload'}));setProject(p=>({...p,assets:[...p.assets,...next]}));};
  return <div className="workspace-section"><div className="asset-toolbar"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Assets durchsuchen…"/><button onClick={()=>file.current?.click()}><ImagePlus size={16}/>Medien hinzufügen</button><input ref={file} hidden multiple type="file" accept="image/*,video/*,audio/*" onChange={e=>addFiles(e.target.files)}/></div><div className="filter-row">{(['all','image','video','headline','banner','audio','export'] as const).map(k=><button key={k} className={filter===k?'active':''} onClick={()=>setFilter(k)}>{k==='all'?'Alle':k} <span>{k==='all'?project.assets.length:project.assets.filter(a=>a.kind===k).length}</span></button>)}</div><div className="asset-grid">{visible.map(a=><AssetCard key={a.id} asset={a} onDelete={()=>setProject(p=>({...p,assets:p.assets.filter(x=>x.id!==a.id)}))}/>) }{!visible.length&&<Empty text="Noch keine passenden Assets vorhanden."/>}</div><label>Projekt-Notizen<textarea value={project.notes} onChange={e=>setProject(p=>({...p,notes:e.target.value}))} placeholder="Hook, Reihenfolge, Intro, CTA, Übergänge …"/></label></div>;
}

function AssetCard({asset,onDelete}:{asset:ProjectAsset;onDelete:()=>void}){return <article className="asset-card"><div className="asset-media">{asset.kind==='video'?<video src={asset.url} muted/>:asset.kind==='audio'?<div className="audio-icon">♪</div>:<img src={asset.url} alt=""/>}<span>{asset.kind}</span><button onClick={onDelete}><Trash2 size={13}/></button></div><b>{asset.name}</b><small>{asset.size?`${(asset.size/1048576).toFixed(1)} MB`:asset.source}</small></article>}

function StudioWorkspace({project,setProject}:Omit<Props,'moduleId'|'onClose'>){
  const [selected,setSelected]=useState<string>(''); const [dragAsset,setDragAsset]=useState<string>(''); const clips=project.timeline; const total=Math.max(30,...clips.map(c=>c.start+c.duration)); const selectedClip=clips.find(c=>c.id===selected); const selectedAsset=project.assets.find(a=>a.id===selectedClip?.assetId);
  const addClip=(lane:TimelineLane,assetId?:string)=>{const asset=project.assets.find(a=>a.id===assetId);const start=Math.max(0,...clips.filter(c=>c.lane===lane).map(c=>c.start+c.duration));const clip:TimelineClip={id:uid('clip'),lane,assetId,label:asset?.name||laneLabels[lane],start,duration:lane==='headline'||lane==='banner'?6:10};setProject(p=>({...p,timeline:[...p.timeline,clip]}));setSelected(clip.id)};
  const patchClip=(patch:Partial<TimelineClip>)=>setProject(p=>({...p,timeline:p.timeline.map(c=>c.id===selected?{...c,...patch}:c)}));
  return <div className="studio-workspace"><div className="studio-preview"><div className="phone-preview">{selectedAsset?(selectedAsset.kind==='video'?<video src={selectedAsset.url} controls/>:selectedAsset.kind==='audio'?<div className="phone-empty">Audio ausgewählt</div>:<img src={selectedAsset.url} alt=""/>):<div className="phone-empty">Timeline-Clip auswählen</div>}{selectedClip?.text&&<div className="phone-text">{selectedClip.text}</div>}</div><div className="studio-assets">{project.assets.slice(0,12).map(a=><button key={a.id} draggable onDragStart={()=>setDragAsset(a.id)} title={a.name}>{a.kind==='video'?<video src={a.url} muted/>:a.kind==='audio'?<span>♪</span>:<img src={a.url} alt=""/>}</button>)}</div></div><div className="timeline"><div className="timeline-scale">0s <span>{Math.round(total/2)}s</span><span>{total}s</span></div>{(Object.keys(laneLabels) as TimelineLane[]).map(lane=><div className="lane" key={lane} onDragOver={e=>e.preventDefault()} onDrop={()=>{if(dragAsset)addClip(lane,dragAsset);setDragAsset('')}}><div className="lane-label"><button onClick={()=>addClip(lane)}>+</button>{laneLabels[lane]}</div><div className="lane-track">{clips.filter(c=>c.lane===lane).map(c=><button key={c.id} onClick={()=>setSelected(c.id)} className={`clip ${selected===c.id?'selected':''}`} style={{left:`${(c.start/total)*100}%`,width:`${Math.max(5,(c.duration/total)*100)}%`}}>{c.label}</button>)}</div></div>)}</div>{selectedClip&&<div className="clip-editor"><b>{selectedClip.label}</b><label>Start<input type="number" value={selectedClip.start} min={0} step={.5} onChange={e=>patchClip({start:Number(e.target.value)})}/></label><label>Dauer<input type="number" value={selectedClip.duration} min={1} step={.5} onChange={e=>patchClip({duration:Number(e.target.value)})}/></label>{selectedClip.lane==='text'&&<label>Text<input value={selectedClip.text||''} onChange={e=>patchClip({text:e.target.value})}/></label>}<button className="danger" onClick={()=>setProject(p=>({...p,timeline:p.timeline.filter(c=>c.id!==selected)}))}><Trash2 size={14}/>Clip löschen</button></div>}</div>
}

function Img2VidWorkspace({project,setProject}:Omit<Props,'moduleId'|'onClose'>){const images=project.assets.filter(a=>['image','headline','banner'].includes(a.kind));const [asset,setAsset]=useState('');const [model,setModel]=useState('bytedance/seedance-1-pro');const [prompt,setPrompt]=useState('Create a realistic video from this image while preserving the original frame exactly. Keep the camera locked off and static. Do not add new objects. Allow only subtle environmental motion.');const [duration,setDuration]=useState(5);const chosen=images.find(a=>a.id===asset);return <div className="workspace-section"><label>Startbild<select value={asset} onChange={e=>setAsset(e.target.value)}><option value="">Asset wählen…</option>{images.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>{chosen&&<img className="img2vid-preview" src={chosen.url} alt=""/>}<label>Videomodell<select value={model} onChange={e=>setModel(e.target.value)}><option value="bytedance/seedance-1-pro">Seedance 1 Pro</option><option value="wan-video/wan-2.2-i2v-fast">Wan 2.2 Fast</option><option value="kwaivgi/kling-v2.1">Kling v2.1</option><option value="prunaai/p-video">PrunaAI P-Video</option></select></label><label>Prompt<textarea className="tall" value={prompt} onChange={e=>setPrompt(e.target.value)}/></label><div className="field-grid"><label>Dauer<select value={duration} onChange={e=>setDuration(Number(e.target.value))}><option>5</option><option>10</option></select></label><label>Seitenverhältnis<select><option>Automatisch</option><option>9:16</option><option>16:9</option></select></label></div><div className="callout"><b>Development-Modus</b><span>Die vollständige Replicate-Bridge aus dem Originalcode benötigt einen Server-Endpunkt. Die Parameterstruktur ist bereits übernommen; API-Schlüssel werden nicht im öffentlichen Frontend gespeichert.</span></div><button disabled={!chosen} className="primary full" onClick={()=>{if(!chosen)return;setProject(p=>({...p,notes:`${p.notes}\nImg2Vid: ${model}, ${duration}s, ${chosen.name}`.trim()}))}}>Job vorbereiten</button></div>}

function Empty({text}:{text:string}){return <div className="empty-state">{text}</div>}

export function ModuleWorkspace({moduleId,project,setProject,onClose}:Props){const defs:Record<string,[string,string,React.ReactNode]>={
  'json-input':['JSON Input','Exportiertes Newspaket als Projektbasis importieren.',<JsonImport project={project} setProject={setProject}/>],
  'news-package':['Newspaket','Drei Versionen bearbeiten, Prompter nutzen und Sprachaufnahme erzeugen.',<NewspackageWorkspace project={project} setProject={setProject}/>],
  'headline':['Schlagzeile','Dreizeiler aus der gewählten Paketversion gestalten und als Asset speichern.',<HeadlineWorkspace project={project} setProject={setProject}/>],
  'research':['Recherche','Alternative News, Plattform-Suche und Video-Downloader.',<ResearchWorkspace project={project}/>],
  'assets':['Assets','Zentrale Medienbibliothek, Upload, Suche, Filter und Projekt-Notizen.',<AssetsWorkspace project={project} setProject={setProject}/>],
  'studio':['Studio','Assets in sechs Spuren kombinieren und die Timeline vorbereiten.',<StudioWorkspace project={project} setProject={setProject}/>],
  'img2vid':['Img2Vid','Bild-Assets für die optionale KI-Videoerzeugung vorbereiten.',<Img2VidWorkspace project={project} setProject={setProject}/>],
};const d=defs[moduleId]||['Modul','Keine Arbeitsfläche vorhanden.',<Empty text="Für dieses Modul ist noch keine Arbeitsfläche definiert."/>];return <aside className="workspace"><Header title={d[0]} subtitle={d[1]} onClose={onClose}/><div className="workspace-body">{d[2]}</div></aside>}
