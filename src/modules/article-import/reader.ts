export type ArticleDocument = {
  url: string;
  source: string;
  title: string;
  publishedAt?: string;
  articleText: string;
  wordCount: number;
  characterCount: number;
  fetchedAt: string;
  reader: 'jina-reader';
};

const READER_BASE = 'https://r.jina.ai/';

export function normalizeArticleUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error('Bitte eine Artikel-URL eintragen.');

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Die Artikel-URL ist ungültig.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Es sind nur HTTP- und HTTPS-Artikel-URLs erlaubt.');
  }

  parsed.hash = '';
  return parsed.toString();
}

function parseReaderResponse(raw: string, url: string): ArticleDocument {
  const marker = 'Markdown Content:';
  const markerIndex = raw.indexOf(marker);
  const header = markerIndex >= 0 ? raw.slice(0, markerIndex) : raw;
  const body = markerIndex >= 0 ? raw.slice(markerIndex + marker.length) : raw;

  const titleFromHeader = header.match(/^Title:\s*(.+)$/im)?.[1]?.trim();
  const publishedAt = header.match(/^Published Time:\s*(.+)$/im)?.[1]?.trim();
  const firstHeading = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const articleText = body.trim();

  if (!articleText) {
    throw new Error('Der Artikel wurde geladen, enthielt aber keinen auslesbaren Text.');
  }

  const parsed = new URL(url);
  const wordCount = articleText.split(/\s+/).filter(Boolean).length;

  return {
    url,
    source: parsed.hostname.replace(/^www\./, ''),
    title: titleFromHeader || firstHeading || parsed.hostname,
    publishedAt: publishedAt || undefined,
    articleText,
    wordCount,
    characterCount: articleText.length,
    fetchedAt: new Date().toISOString(),
    reader: 'jina-reader',
  };
}

export async function readArticle(value: string): Promise<ArticleDocument> {
  const url = normalizeArticleUrl(value);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(`${READER_BASE}${url}`, {
      method: 'GET',
      headers: { Accept: 'text/plain' },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Artikel konnte nicht geladen werden (HTTP ${response.status}).`);
    }

    return parseReaderResponse(await response.text(), url);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Der Artikelabruf hat länger als 20 Sekunden gedauert und wurde abgebrochen.');
    }
    if (error instanceof Error) throw error;
    throw new Error('Der Artikel konnte nicht geladen werden.');
  } finally {
    window.clearTimeout(timeout);
  }
}
