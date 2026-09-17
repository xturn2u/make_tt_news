import type { ResearchLink } from '../domain/project';

function cleanTitle(value:string){return value.replace(/\s+/g,' ').replace(/^[-*#\s]+/,'').trim().slice(0,120)}

export async function searchTopLinks(query:string):Promise<ResearchLink[]> {
  const endpoint=`https://s.jina.ai/?q=${encodeURIComponent(query)}`;
  const response=await fetch(endpoint,{headers:{Accept:'text/plain'}});
  if(!response.ok)throw new Error(`Recherche fehlgeschlagen (${response.status}).`);
  const text=await response.text();
  const seen=new Set<string>();
  const links:ResearchLink[]=[];
  const regex=/\[([^\]]{2,200})\]\((https?:\/\/[^\s)]+)\)/g;
  for(const match of text.matchAll(regex)){
    const title=cleanTitle(match[1]||'');
    const url=(match[2]||'').trim();
    if(!title||!url||seen.has(url))continue;
    if(/jina\.ai|google\.com\/search/i.test(url))continue;
    seen.add(url);links.push({title,url});
    if(links.length===3)break;
  }
  if(!links.length)throw new Error('Die Suche hat keine direkten Treffer geliefert.');
  return links;
}
