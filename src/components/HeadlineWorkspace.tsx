import { useEffect, useMemo, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { Download, Newspaper, Save } from 'lucide-react';
import type { NewsVersion, ProjectAsset, ProjectState, VersionKey } from '../domain/project';
import { uid } from '../domain/project';

type Props = {
  project: ProjectState;
  setProject: React.Dispatch<React.SetStateAction<ProjectState>>;
  version: VersionKey;
};

type ArticleStyle = { id:'editorial'|'news'|'boulevard'; name:string; hint:string };
type ArticleCard = { key:string; style:ArticleStyle; url:string; filename:string; headline:string };

const articleStyles: ArticleStyle[] = [
  {id:'editorial',name:'Editorial',hint:'ruhig · hochwertig · meinungsstark'},
  {id:'news',name:'News',hint:'klar · seriös · öffentlich'},
  {id:'boulevard',name:'Boulevard',hint:'direkt · groß · aufmerksamkeitsstark'},
];

const cleanDescription=(value:string)=>String(value||'').replace(/(^|\s)#[\p{L}\p{N}_-]+/gu,' ').replace(/\s+/g,' ').trim();
const stripTts=(value:string)=>String(value||'').replace(/<\/?(?:emphasis|loud|soft|slow|fast|whisper)>/gi,'').replace(/\[(?:pause|long-pause)\]/gi,'').replace(/\s{2,}/g,' ').trim();
const firstWords=(value:string,max:number)=>stripTts(value).split(/\s+/).filter(Boolean).slice(0,max).join(' ');
const safeName=(value:string)=>String(value||'artikel').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,54)||'artikel';
const todayDE=()=>new Intl.DateTimeFormat('de-DE',{day:'numeric',month:'long',year:'numeric'}).format(new Date());
const cardDate=()=>new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date());

function parseHeadline(value:string){
  const lines=String(value||'').replace(/\r\n/g,'\n').replace(/\r/g,'\n').replace(/\\n/g,'\n').split(/\n/).map(v=>v.trim()).filter(Boolean);
  if(lines.length===1)return {k:'',h:lines[0],s:''};
  if(lines.length===2)return {k:lines[0],h:lines[1],s:''};
  return {k:lines[0]||'',h:lines[1]||'',s:lines.slice(2).join(' ')};
}

function versionText(data:NewsVersion){
  const t=data.triple_headline;
  return [t.line1,t.line2,t.line3].map(v=>String(v||'').trim()).filter(Boolean).join('\n') || data.header;
}

function wrapLines(ctx:CanvasRenderingContext2D,text:string,maxWidth:number,maxLines:number){
  const words=String(text||'').split(/\s+/).filter(Boolean),lines:string[]=[];let line='';
  for(const word of words){const test=line?`${line} ${word}`:word;if(ctx.measureText(test).width>maxWidth&&line){lines.push(line);line=word;if(lines.length===maxLines)break}else line=test}
  if(lines.length<maxLines&&line)lines.push(line);
  const used=lines.join(' ').split(/\s+/).filter(Boolean).length;
  if(used<words.length&&lines.length){let last=lines[lines.length-1];while(last&&ctx.measureText(last+' …').width>maxWidth)last=last.split(' ').slice(0,-1).join(' ');lines[lines.length-1]=(last||'')+' …'}
  return lines;
}
function drawLines(ctx:CanvasRenderingContext2D,lines:string[],x:number,y:number,lineHeight:number){lines.forEach((line,index)=>ctx.fillText(line,x,y+index*lineHeight));return y+lines.length*lineHeight}
function roundRect(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number,fill:string){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill()}

function createArticleCard(data:NewsVersion,version:VersionKey,style:ArticleStyle):ArticleCard{
  const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1350;const ctx=canvas.getContext('2d')!;
  const card={headline:String(data.header||'Ohne Überschrift').trim(),description:cleanDescription(data.description)||'Die wichtigsten Informationen dieser Meldung kompakt zusammengefasst.',excerpt:firstWords(data.speech_text,40)||'Noch kein Sprechertext hinterlegt.',date:cardDate()};
  if(style.id==='editorial'){
    ctx.fillStyle='#f6f3ec';ctx.fillRect(0,0,1080,1350);ctx.fillStyle='#171717';ctx.fillRect(0,0,1080,18);ctx.font='800 38px Georgia,serif';ctx.fillText('DAS JOURNAL',72,94);ctx.fillStyle='#a61f2d';ctx.fillRect(72,126,936,5);ctx.fillStyle='#6f675d';ctx.font='700 22px Arial';ctx.fillText('NACHRICHTEN  ·  '+card.date,72,178);ctx.fillStyle='#151515';ctx.font='900 76px Georgia,serif';let y=drawLines(ctx,wrapLines(ctx,card.headline,936,5),72,278,88)+28;ctx.fillStyle='#a61f2d';ctx.fillRect(72,y,120,7);y+=50;ctx.fillStyle='#38342f';ctx.font='600 32px Georgia,serif';y=drawLines(ctx,wrapLines(ctx,card.description,936,4),72,y,44)+32;ctx.fillStyle='#6d675f';ctx.font='400 27px Georgia,serif';drawLines(ctx,wrapLines(ctx,card.excerpt,936,7),72,y,40);ctx.fillStyle='#171717';ctx.fillRect(72,1260,936,2);ctx.font='700 20px Arial';ctx.fillText('NEWS STUDIO  ·  ARTIKELAUSSCHNITT',72,1303);
  }else if(style.id==='news'){
    ctx.fillStyle='#fff';ctx.fillRect(0,0,1080,1350);ctx.fillStyle='#073f86';ctx.fillRect(0,0,1080,218);ctx.fillStyle='#1684d8';ctx.beginPath();ctx.arc(930,80,210,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.font='900 43px Arial';ctx.fillText('NEWS AKTUELL',68,92);ctx.font='600 23px Arial';ctx.fillText(card.date,68,152);ctx.fillStyle='#0d2745';ctx.font='900 68px Arial';let y=drawLines(ctx,wrapLines(ctx,card.headline,944,5),68,314,78)+30;ctx.fillStyle='#1684d8';ctx.fillRect(68,y,944,7);y+=48;ctx.fillStyle='#24425f';ctx.font='650 31px Arial';y=drawLines(ctx,wrapLines(ctx,card.description,944,4),68,y,43)+34;roundRect(ctx,68,y,944,Math.min(300,1350-y-120),20,'#eef5fb');ctx.fillStyle='#274761';ctx.font='450 27px Arial';drawLines(ctx,wrapLines(ctx,card.excerpt,864,6),108,y+58,40);ctx.fillStyle='#6a7e91';ctx.font='700 19px Arial';ctx.fillText('KURZ ERKLÄRT  ·  40-WÖRTER-AUSZUG',68,1300);
  }else{
    ctx.fillStyle='#fff';ctx.fillRect(0,0,1080,1350);ctx.fillStyle='#e51b23';ctx.fillRect(0,0,1080,185);ctx.fillStyle='#fff';ctx.font='950 54px Arial Black,Arial';ctx.fillText('AKTUELL',58,92);ctx.font='800 24px Arial';ctx.fillText(card.date,60,145);roundRect(ctx,58,225,260,52,7,'#ffd400');ctx.fillStyle='#111';ctx.font='950 25px Arial Black,Arial';ctx.fillText('TOP-MELDUNG',78,260);ctx.fillStyle='#080808';ctx.font='950 76px Arial Black,Arial';let y=drawLines(ctx,wrapLines(ctx,card.headline.toUpperCase(),964,5),58,368,84)+24;ctx.fillStyle='#e51b23';ctx.fillRect(58,y,964,9);y+=48;ctx.fillStyle='#202020';ctx.font='850 31px Arial';y=drawLines(ctx,wrapLines(ctx,card.description,964,4),58,y,43)+28;roundRect(ctx,58,y,964,Math.min(290,1350-y-105),14,'#f1f1f1');ctx.fillStyle='#333';ctx.font='500 27px Arial';drawLines(ctx,wrapLines(ctx,card.excerpt,884,6),98,y+52,40);ctx.fillStyle='#e51b23';ctx.fillRect(58,1282,190,7);ctx.fillStyle='#151515';ctx.font='900 19px Arial';ctx.fillText('NEWS-KARTE  ·  NEWS STUDIO',270,1291);
  }
  return {key:`${version}-${style.id}`,style,url:canvas.toDataURL('image/png'),filename:`artikel-${safeName(card.headline)}-${version}-${style.id}.png`,headline:card.headline};
}

async function dataUrlBlob(url:string){return (await fetch(url)).blob()}
function download(url:string,name:string){const a=document.createElement('a');a.href=url;a.download=name;a.click()}

export function HeadlineWorkspace({project,setProject,version}:Props){
  const data=project.newsPackage?.versions[version];
  const [style,setStyle]=useState<'pressespiegel'|'pressepunkt'>('pressespiegel');
  const [headlineText,setHeadlineText]=useState(data?versionText(data):'');
  const [extraEnabled,setExtraEnabled]=useState(false);
  const [extra,setExtra]=useState('');
  const [date,setDate]=useState(todayDE());
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const stageRef=useRef<HTMLDivElement>(null);

  useEffect(()=>{if(data)setHeadlineText(versionText(data))},[data,version]);
  const parsed=useMemo(()=>parseHeadline(headlineText),[headlineText]);
  const cards=useMemo(()=>data?articleStyles.map(s=>createArticleCard(data,version,s)):[],[data,version]);
  if(!data)return <div className="empty-state">{version.toUpperCase()} ist im Paket nicht vorhanden.</div>;

  const capture=async()=>{
    if(!stageRef.current)throw new Error('Vorschau ist nicht bereit.');
    if(document.fonts?.ready)await document.fonts.ready;
    const canvas=await html2canvas(stageRef.current,{scale:Math.max(2,Math.round(window.devicePixelRatio||2)),backgroundColor:null,useCORS:true});
    const base=safeName(parsed.h||parsed.k||'schlagzeile');
    return {url:canvas.toDataURL('image/png'),filename:`${base}.png`,label:parsed.h||parsed.k||'Schlagzeile'};
  };
  const saveHeadline=async(doDownload=false)=>{setBusy(true);setMessage('');try{const rendered=await capture();if(doDownload){download(rendered.url,rendered.filename)}else{const blob=await dataUrlBlob(rendered.url);const asset:ProjectAsset={id:uid('headline'),kind:'headline',name:rendered.filename,url:URL.createObjectURL(blob),mime:'image/png',size:blob.size,source:'headline-generator',version};setProject(p=>({...p,assets:[asset,...p.assets]}));setMessage('Schlagzeile als gemeinsames Asset gespeichert.')}}catch(error){setMessage(error instanceof Error?error.message:String(error))}finally{setBusy(false)}};
  const saveArticle=async(card:ArticleCard)=>{const exists=project.assets.some(a=>a.source==='article-generator'&&a.name===card.filename);if(exists)return;const blob=await dataUrlBlob(card.url);const asset:ProjectAsset={id:uid('article'),kind:'headline',name:card.filename,url:URL.createObjectURL(blob),mime:'image/png',size:blob.size,source:'article-generator',version};setProject(p=>({...p,assets:[asset,...p.assets]}));};
  const saveAll=async()=>{setBusy(true);try{for(const card of cards)await saveArticle(card);setMessage(`${cards.length} Zeitungsausschnitte als gemeinsame Headline-Assets gespeichert.`)}finally{setBusy(false)}};

  return <div className="workspace-section original-headline-workspace">
    <div className="version-context"><b>{version.toUpperCase()}</b><span>Schlagzeilengenerator aus dem Original-Studio</span></div>
    <div className="segmented"><button className={style==='pressespiegel'?'active':''} onClick={()=>setStyle('pressespiegel')}>Pressespiegel</button><button className={style==='pressepunkt'?'active':''} onClick={()=>setStyle('pressepunkt')}>Pressepunkt</button></div>
    <div className="headline-options"><label className="checkline"><input type="checkbox" checked={extraEnabled} onChange={e=>setExtraEnabled(e.target.checked)}/> Zusatzthema</label>{extraEnabled&&<input value={extra} onChange={e=>setExtra(e.target.value)} placeholder="Thema, z. B. BREAKING NEWS"/>}<input value={date} onChange={e=>setDate(e.target.value)} placeholder="Datum"/></div>
    <label>Schlagzeilentext<textarea className="headline-input" value={headlineText} onChange={e=>setHeadlineText(e.target.value)}/><small>Zeile 1 = Kicker · Zeile 2 = Hauptzeile · Zeile 3 = Unterzeile</small></label>
    <div className="headline-original-preview">
      <div ref={stageRef} className={`headline-stage ${style==='pressepunkt'?'headline-pp':'headline-hg'}`}>
        {extraEnabled&&extra&&<div className="headline-extra-row"><span>{extra}</span></div>}
        <div className="headline-panel">{style==='pressepunkt'?<><p className="headline-kicker">{parsed.k}</p><h2>{parsed.h}</h2></>:<><p className="headline-kicker">{parsed.k}</p><h2>{parsed.h||parsed.k}</h2>{parsed.s&&<p className="headline-sub">{parsed.s}</p>}</>}</div>
        <div className="headline-date-row"><span>{date||todayDE()}</span></div>
      </div>
    </div>
    <div className="action-row"><button className="primary" disabled={busy} onClick={()=>void saveHeadline(false)}><Save size={15}/>Als Asset speichern</button><button disabled={busy} onClick={()=>void saveHeadline(true)}><Download size={15}/>PNG</button></div>
    {message&&<div className="message ok">{message}</div>}

    <div className="newspaper-section">
      <div className="section-heading"><div><span>Artikel-Screenshots</span><h3>Zeitungsausschnitte aus {version.toUpperCase()}</h3><p>Wie im Original: Überschrift, Beschreibung ohne Hashtags und die ersten 40 Wörter des Sprechtexts.</p></div><button className="primary" disabled={busy} onClick={()=>void saveAll()}><Newspaper size={15}/>Alle 3 speichern</button></div>
      <div className="newspaper-grid">{cards.map(card=><article key={card.key} className="newspaper-card"><img src={card.url} alt={`${card.style.name} Artikelausschnitt`}/><div><strong>{card.style.name}</strong><small>{card.style.hint}</small><div className="article-actions"><button className="primary" onClick={()=>void saveArticle(card)}>Als Headline speichern</button><button onClick={()=>download(card.url,card.filename)}>PNG</button></div></div></article>)}</div>
    </div>
  </div>;
}
