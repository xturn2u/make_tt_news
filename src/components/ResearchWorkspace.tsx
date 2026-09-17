import { ExternalLink, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ProjectState } from '../domain/project';
import { availableVersionKeys } from '../domain/project';

export function ResearchWorkspace({project}:{project:ProjectState}){
  const [platform,setPlatform]=useState('google');
  const [query,setQuery]=useState('');
  const [url,setUrl]=useState('');
  const versions=availableVersionKeys(project.newsPackage);
  const suggestions=useMemo(()=>versions.map(v=>({key:v,label:project.newsPackage?.versions[v]?.header||''})).filter(v=>v.label),[versions,project.newsPackage]);
  const fallback=project.newsPackage?.meta.topic||suggestions[0]?.label||'';
  const search=()=>{const term=encodeURIComponent(query||fallback);let target='https://www.google.com/search?q='+term;if(platform==='images')target='https://www.google.com/search?tbm=isch&q='+term;if(platform==='x')target='https://x.com/search?q='+term+'&src=typed_query';if(platform==='youtube')target='https://www.youtube.com/results?search_query='+term;if(platform==='tiktok')target='https://www.tiktok.com/search?q='+term;window.open(target,'_blank','noopener')};
  const downloader=async()=>{if(!url)return;try{await navigator.clipboard.writeText(url)}catch{}window.open('https://cobalt.tools/?u='+encodeURIComponent(url),'_blank','noopener')};
  return <div className="workspace-section">
    <div className="callout shared-callout"><Search size={18}/><div><b>Optionale Recherche · global</b><span>Dieses Werkzeug gehört zu keinem Versions-Flow. Ergebnisse und heruntergeladene Medien können anschließend als gemeinsame Assets genutzt werden.</span></div></div>
    {suggestions.length>0&&<div className="research-suggestions">{suggestions.map(item=><button key={item.key} onClick={()=>setQuery(item.label)}><b>{item.key.toUpperCase()}</b><span>{item.label}</span></button>)}</div>}
    <label>Suchbegriff<input value={query} onChange={e=>setQuery(e.target.value)} placeholder={fallback||'Suchbegriff'}/></label>
    <div className="segmented wrap">{[['google','Google'],['x','X'],['youtube','YouTube'],['tiktok','TikTok'],['images','Bilder']].map(([value,label])=><button key={value} className={platform===value?'active':''} onClick={()=>setPlatform(value)}>{label}</button>)}</div>
    <button className="primary full" onClick={search}><Search size={16}/>Suche öffnen</button>
    <hr/>
    <label>Recherche-Video<input value={url} onChange={e=>setUrl(e.target.value)} placeholder="Video-Link einfügen"/></label>
    <button className="full" onClick={()=>void downloader()}><ExternalLink size={16}/>Download-Seite öffnen</button>
  </div>;
}
