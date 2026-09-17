import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Mic, Pause, Play, RotateCcw, Save, Square, X } from 'lucide-react';
import { useProject, type VersionKey } from '../../project/ProjectContext';

const versions: VersionKey[] = ['v1','v2','v3'];

function copy(text: string) { return navigator.clipboard?.writeText(text).catch(()=>undefined); }
function countWords(text: string) { return text.trim() ? text.trim().split(/\s+/).length : 0; }

export function NewsPackagePanel() {
  const { newsPackage, selectedVersion, setSelectedVersion, updateVersion, addAsset, settings } = useProject();
  const [prompterOpen, setPrompterOpen] = useState(false);
  if (!newsPackage) return <EmptyPackage />;
  const item = newsPackage.versions[selectedVersion];
  const triple = item.triple_headline;
  const descHash = [item.description, ...item.hashtags].filter(Boolean).join('\n');

  return <div className="module-stack">
    <div className="module-title-row"><div><h2>{newsPackage.meta.topic}</h2><p><a href={newsPackage.source_url} target="_blank" rel="noreferrer">Quelle öffnen ↗</a>{newsPackage.meta.breaking ? ' · Breaking' : ''}</p></div></div>
    <div className="version-tabs">{versions.map((key)=><button key={key} className={selectedVersion===key?'active':''} onClick={()=>setSelectedVersion(key)}>Version {key.slice(1)}</button>)}</div>
    <label className="field"><span>Überschrift</span><input value={item.header} maxLength={90} onChange={(e)=>updateVersion(selectedVersion,{header:e.target.value})}/></label>
    <label className="field"><span>Sprechtext <b>{countWords(item.speech_text)} Wörter</b></span><textarea className="speech-editor" value={item.speech_text} onChange={(e)=>updateVersion(selectedVersion,{speech_text:e.target.value})}/><span className="field-actions"><button onClick={()=>copy(item.speech_text)}><Copy size={14}/> Kopieren</button><button onClick={()=>setPrompterOpen(true)}><Play size={14}/> Prompter</button></span></label>
    <div className="triple-grid">
      <label className="field"><span>Zeile 1</span><input value={triple.line1} onChange={(e)=>updateVersion(selectedVersion,{triple_headline:{...triple,line1:e.target.value}})}/></label>
      <label className="field"><span>Zeile 2</span><input value={triple.line2} onChange={(e)=>updateVersion(selectedVersion,{triple_headline:{...triple,line2:e.target.value}})}/></label>
      <label className="field"><span>Zeile 3</span><input value={triple.line3} onChange={(e)=>updateVersion(selectedVersion,{triple_headline:{...triple,line3:e.target.value}})}/></label>
    </div>
    <label className="field"><span>Beschreibung + Hashtags</span><textarea value={descHash} onChange={(e)=>{
      const lines=e.target.value.split(/\n/); const tags=lines.filter((line)=>line.trim().startsWith('#')).slice(0,5); const description=lines.filter((line)=>!line.trim().startsWith('#')).join('\n').trim(); updateVersion(selectedVersion,{description,hashtags:tags});
    }}/><span className="field-actions"><button onClick={()=>copy(descHash)}><Copy size={14}/> Kopieren</button></span></label>
    {prompterOpen && <Prompter text={item.speech_text} wpm={settings.prompterWpm} onClose={()=>setPrompterOpen(false)} onSave={(blob)=>addAsset({kind:'audio',name:`sprechaufnahme-${selectedVersion}-${Date.now()}.webm`,url:URL.createObjectURL(blob),mimeType:blob.type,size:blob.size,file:blob,source:'prompter'})}/>} 
  </div>;
}

function EmptyPackage(){return <div className="empty-workspace"><h2>Noch kein Newspaket</h2><p>Öffne zuerst den JSON-Input und übernimm ein Paket.</p></div>}

function Prompter({text,wpm,onClose,onSave}:{text:string;wpm:number;onClose:()=>void;onSave:(blob:Blob)=>void}){
  const [running,setRunning]=useState(false); const [progress,setProgress]=useState(0); const [recording,setRecording]=useState(false); const [recorded,setRecorded]=useState<Blob|null>(null);
  const startAt=useRef(0); const baseProgress=useRef(0); const raf=useRef(0); const recorder=useRef<MediaRecorder|null>(null); const stream=useRef<MediaStream|null>(null); const chunks=useRef<Blob[]>([]);
  const words=useMemo(()=>text.trim().split(/\s+/).filter(Boolean),[text]); const duration=Math.max(4,(words.length/Math.max(40,wpm))*60);
  useEffect(()=>()=>{cancelAnimationFrame(raf.current);stream.current?.getTracks().forEach(t=>t.stop())},[]);
  function tick(now:number){const next=Math.min(1,baseProgress.current+(now-startAt.current)/1000/duration);setProgress(next);if(next<1)raf.current=requestAnimationFrame(tick);else setRunning(false)}
  function play(){if(running)return;startAt.current=performance.now();baseProgress.current=progress;setRunning(true);raf.current=requestAnimationFrame(tick)}
  function pause(){cancelAnimationFrame(raf.current);baseProgress.current=progress;setRunning(false)}
  function reset(){pause();setProgress(0);baseProgress.current=0}
  async function startRecording(){try{const s=await navigator.mediaDevices.getUserMedia({audio:true});stream.current=s;chunks.current=[];const rec=new MediaRecorder(s);recorder.current=rec;rec.ondataavailable=(e)=>{if(e.data.size)chunks.current.push(e.data)};rec.onstop=()=>{const blob=new Blob(chunks.current,{type:rec.mimeType||'audio/webm'});setRecorded(blob);s.getTracks().forEach(t=>t.stop());setRecording(false)};rec.start(200);setRecording(true);reset();play()}catch{alert('Mikrofon konnte nicht geöffnet werden.')}}
  function stopRecording(){recorder.current?.stop();pause()}
  const translate=Math.max(0,progress*100);
  return <div className="prompter-backdrop"><div className="prompter-modal"><div className="prompter-head"><div><strong>Prompter</strong><span>{wpm} WPM · {words.length} Wörter</span></div><button onClick={onClose}><X/></button></div><div className="prompter-screen"><div className="prompter-line"/><div className="prompter-text" style={{transform:`translateY(${50-translate}%)`}}>{words.map((word,index)=>{const ratio=index/Math.max(1,words.length-1);return <span key={index} className={ratio<progress?'done':Math.abs(ratio-progress)<.015?'active':''}>{word} </span>})}</div></div><div className="prompter-controls"><button onClick={running?pause:play}>{running?<Pause/>:<Play/>}</button><button onClick={reset}><RotateCcw/></button>{!recording?<button className="record" onClick={startRecording}><Mic/> Aufnahme</button>:<button className="record active" onClick={stopRecording}><Square/> Stop</button>}{recorded&&<button className="primary" onClick={()=>{onSave(recorded);setRecorded(null)}}><Save/> In Assets</button>}</div></div></div>
}
