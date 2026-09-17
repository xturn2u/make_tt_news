import { ExternalLink, Image, Search } from 'lucide-react';
import type { ProjectState, VersionKey } from '../domain/project';
import { availableVersionKeys } from '../domain/project';

type Props={project:ProjectState;setProject:React.Dispatch<React.SetStateAction<ProjectState>>};

export function ResearchWorkspace({project,setProject}:Props){
  const versions=availableVersionKeys(project.newsPackage);
  const patchQuery=(version:VersionKey,value:string)=>setProject(current=>{const previous=current.research[version];return {...current,research:{...current.research,[version]:{query:value,imageSearchUrl:`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(value)}`,links:previous?.links||[],status:'idle'}}}});
  return <div className="workspace-section">
    <div className="callout shared-callout"><Search size={18}/><div><b>Recherche für alle Versionsstränge</b><span>Beim Klick auf „Workflow starten“ wird jede Version separat recherchiert. Die Top-3-Treffer erscheinen direkt am jeweiligen Newspaket.</span></div></div>
    <div className="research-version-list">{versions.map(version=>{const state=project.research[version];const fallback=project.newsPackage?.versions[version]?.header||'';const query=state?.query||fallback;return <section key={version} className="research-version-card"><div className="research-version-head"><b>{version.toUpperCase()}</b><span>{state?.status==='searching'?'Suche läuft …':state?.status==='done'?`${state.links.length} Treffer`:state?.status==='error'?'Fehler':'Bereit'}</span></div><label>Suchbegriff<input value={query} onChange={event=>patchQuery(version,event.target.value)}/></label><div className="research-version-links"><a href={state?.imageSearchUrl||`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`} target="_blank" rel="noreferrer"><Image size={13}/>Google Bildsuche</a>{state?.links.map((link,index)=><a key={link.url} href={link.url} target="_blank" rel="noreferrer"><ExternalLink size={12}/><span>{index+1}. {link.title}</span></a>)}</div>{state?.error&&<small className="research-error-text">{state.error}</small>}</section>})}</div>
  </div>;
}
