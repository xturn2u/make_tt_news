import { ExternalLink, Image, Search } from 'lucide-react';
import type { ProjectState, VersionKey } from '../domain/project';
import { availableVersionKeys } from '../domain/project';

type Props={project:ProjectState;setProject?:React.Dispatch<React.SetStateAction<ProjectState>>};

function linksFor(query:string){const q=encodeURIComponent(query);return[
  ['Google News',`https://www.google.com/search?tbm=nws&q=${q}`],
  ['Google Web',`https://www.google.com/search?q=${q}`],
  ['Google Bilder',`https://www.google.com/search?tbm=isch&q=${q}`],
  ['X / Twitter',`https://x.com/search?q=${q}&src=typed_query&f=live`],
  ['TikTok',`https://www.tiktok.com/search?q=${q}`],
  ['YouTube',`https://www.youtube.com/results?search_query=${q}`],
  ['Bing News',`https://www.bing.com/news/search?q=${q}`],
] as const}

export function ResearchWorkspace({project,setProject}:Props){
  const versions=availableVersionKeys(project.newsPackage);
  const patchQuery=(version:VersionKey,value:string)=>{if(!setProject)return;setProject(current=>{const previous=current.research[version];return {...current,research:{...current.research,[version]:{query:value,imageSearchUrl:'',links:previous?.links||[],status:'idle'}}}})};
  return <div className="workspace-section">
    <div className="callout shared-callout"><Search size={18}/><div><b>Recherche für alle Versionsstränge</b><span>Workflow starten erzeugt die Recherche-Äste am jeweiligen Newspaket. Hier bleiben zusätzlich alle direkten Quellen wie X, TikTok, YouTube und Bildersuche verfügbar.</span></div></div>
    <div className="research-version-list">{versions.map(version=>{const state=project.research[version];const fallback=project.newsPackage?.versions[version]?.header||'';const query=state?.query||fallback;return <section key={version} className="research-version-card"><div className="research-version-head"><b>{version.toUpperCase()}</b><span>{state?.status==='searching'?'Suche läuft …':state?.status==='done'?`${state.links.length} Flow-Links`:state?.status==='error'?'Fehler':'Bereit'}</span></div><label>Suchbegriff<input value={query} readOnly={!setProject} onChange={event=>patchQuery(version,event.target.value)}/></label><div className="research-source-grid">{linksFor(query).map(([label,url])=><a key={label} href={url} target="_blank" rel="noreferrer">{label==='Google Bilder'?<Image size={13}/>:<ExternalLink size={12}/>}<span>{label}</span></a>)}</div>{state?.status==='done'&&state.links.length>0&&<div className="research-version-links"><small>Links am Flow</small>{state.links.map((link,index)=><a key={`${link.url}-${index}`} href={link.url} target="_blank" rel="noreferrer"><ExternalLink size={12}/><span>{index+1}. {link.title}</span></a>)}</div>}{state?.error&&<small className="research-error-text">{state.error}</small>}</section>})}</div>
  </div>;
}
