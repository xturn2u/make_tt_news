import type { ResearchLink } from '../domain/project';

type Rss2JsonItem = { title?: string; link?: string; guid?: string };
type Rss2JsonResponse = { status?: string; items?: Rss2JsonItem[] };

function cleanTitle(value: string) {
  return value.replace(/\s+/g, ' ').replace(/^[-*#\s]+/, '').trim().slice(0, 140);
}

function fallbackLinks(query: string): ResearchLink[] {
  const encoded = encodeURIComponent(query);
  return [
    { title: 'Google News öffnen', url: `https://news.google.com/search?q=${encoded}&hl=de&gl=DE&ceid=DE%3Ade` },
    { title: 'Google Websuche öffnen', url: `https://www.google.com/search?q=${encoded}` },
    { title: 'Bing News öffnen', url: `https://www.bing.com/news/search?q=${encoded}` },
  ];
}

export async function searchTopLinks(query: string): Promise<ResearchLink[]> {
  const term = query.trim();
  if (!term) return [];

  const feed = `https://news.google.com/rss/search?q=${encodeURIComponent(term)}&hl=de&gl=DE&ceid=DE:de`;
  const endpoint = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed)}&count=6`;

  try {
    const response = await fetch(endpoint, { headers: { Accept: 'application/json' } });
    if (!response.ok) return fallbackLinks(term);
    const data = await response.json() as Rss2JsonResponse;
    if (data.status !== 'ok' || !Array.isArray(data.items)) return fallbackLinks(term);

    const seen = new Set<string>();
    const links: ResearchLink[] = [];
    for (const item of data.items) {
      const url = String(item.link || item.guid || '').trim();
      const title = cleanTitle(String(item.title || ''));
      if (!url || !title || seen.has(url)) continue;
      seen.add(url);
      links.push({ title, url });
      if (links.length === 3) break;
    }
    return links.length ? links : fallbackLinks(term);
  } catch {
    return fallbackLinks(term);
  }
}
