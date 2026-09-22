import { invoke } from '@tauri-apps/api/core';
import type { MediaResult, NewsArticle, ReplicateResult, SystemStatus } from './types';

const inTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export async function systemStatus(): Promise<SystemStatus> {
  if (!inTauri()) {
    return {
      platform: 'Browser preview',
      ffmpegAvailable: false,
      ffmpegPath: null,
      sayAvailable: false,
      ollamaAvailable: false,
      ollamaModels: [],
      dataDir: 'Desktop-Funktionen sind nur in der Tauri-App verfügbar.'
    };
  }
  return invoke<SystemStatus>('system_status');
}

export async function fetchNewsArticle(url: string): Promise<NewsArticle> {
  if (!inTauri()) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`News HTTP ${response.status}`);
    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script,style,svg,noscript,template').forEach((element) => element.remove());
    const root = doc.querySelector('article') ?? doc.querySelector('main') ?? doc.body;
    const text = (root?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 45000);
    const title = (doc.querySelector('title')?.textContent ?? new URL(url).hostname).trim();
    return { url, title, text, siteName: new URL(url).hostname.replace(/^www\./, ''), wordCount: text.split(/\s+/).filter(Boolean).length };
  }
  return invoke<NewsArticle>('fetch_news_article', { url });
}

export async function ollamaGenerate(model: string, prompt: string): Promise<string> {
  return invoke<string>('ollama_generate', { model, prompt });
}

export async function searchWikimedia(query: string, limit = 8): Promise<MediaResult[]> {
  if (!inTauri()) {
    const endpoint = new URL('https://commons.wikimedia.org/w/api.php');
    endpoint.search = new URLSearchParams({
      action: 'query', generator: 'search', gsrsearch: query, gsrnamespace: '6', gsrlimit: String(limit),
      prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '800', format: 'json', origin: '*'
    }).toString();
    const response = await fetch(endpoint);
    if (!response.ok) throw new Error(`Wikimedia HTTP ${response.status}`);
    const json = await response.json();
    const pages = Object.values(json?.query?.pages ?? {}) as any[];
    return pages.map((page) => {
      const info = page.imageinfo?.[0] ?? {};
      const meta = info.extmetadata ?? {};
      return {
        title: String(page.title ?? '').replace(/^File:/, ''),
        thumbUrl: info.thumburl ?? info.url ?? '',
        originalUrl: info.url ?? info.thumburl ?? '',
        pageUrl: info.descriptionurl ?? '',
        license: meta.LicenseShortName?.value ?? meta.License?.value ?? 'Unbekannt',
        artist: stripHtml(meta.Artist?.value ?? meta.Credit?.value ?? 'Unbekannt')
      };
    }).filter((x) => x.thumbUrl);
  }
  return invoke<MediaResult[]>('wikimedia_search', { query, limit });
}

export async function createTts(text: string, voice = ''): Promise<string> {
  return invoke<string>('create_tts', { text, voice });
}

export async function renderVerticalVideo(imageUrl: string, audioPath: string): Promise<string> {
  return invoke<string>('render_vertical_video', { imageUrl, audioPath });
}

export async function replicatePredict(token: string, version: string, inputJson: string): Promise<ReplicateResult> {
  return invoke<ReplicateResult>('replicate_predict', { token, version, inputJson });
}

export async function revealInFinder(path: string): Promise<void> {
  await invoke('reveal_in_finder', { path });
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}


export type ModelCatalogItem = {
  id: string;
  name: string;
  description: string;
  size: string;
  recommended?: boolean;
};

export const MODEL_CATALOG: ModelCatalogItem[] = [
  { id: 'qwen2.5:7b', name: 'Qwen 2.5 · 7B', description: 'Starkes mehrsprachiges Modell für Recherche und deutsche Skripte.', size: '~4,7 GB', recommended: true },
  { id: 'llama3.2:3b', name: 'Llama 3.2 · 3B', description: 'Schneller und sparsamer Einstieg für kleinere Macs.', size: '~2,0 GB' },
  { id: 'mistral:7b', name: 'Mistral · 7B', description: 'Schnelles allgemeines Modell für lokale Workflows.', size: '~4,1 GB' }
];

export async function pullOllamaModel(model: string, onProgress?: (status: string) => void): Promise<void> {
  await invoke('ollama_pull_model', { model, onProgress: undefined });
}

export async function installFfmpeg(): Promise<string> {
  return invoke<string>('install_ffmpeg');
}
