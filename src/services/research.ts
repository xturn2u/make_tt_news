import type { ResearchLink } from '../domain/project';

export async function searchTopLinks(query:string):Promise<ResearchLink[]> {
  const term=query.trim();
  if(!term)return [];
  const q=encodeURIComponent(term);
  return [
    {title:'Google News öffnen',url:`https://www.google.com/search?tbm=nws&q=${q}`},
    {title:'Google Websuche öffnen',url:`https://www.google.com/search?q=${q}`},
    {title:'Bing News öffnen',url:`https://www.bing.com/news/search?q=${q}`},
  ];
}
