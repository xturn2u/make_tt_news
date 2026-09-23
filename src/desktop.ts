import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import type { MediaResult, NewsArticle, ReplicateResult, SystemStatus } from './types';
import type { LocalTtsProvider, LocalTtsStatus } from './localTts';

const inTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export async function systemStatus(): Promise<SystemStatus> {
  if (!inTauri()) {
    return {
      platform: 'Browser preview',
      ffmpegAvailable: false,
      ffmpegPath: null,
      sayAvailable: false,
      ttsVoices: [],
      ollamaAvailable: false,
      ollamaModels: [],
      dataDir: 'Desktop-Funktionen sind nur in der Tauri-App verfügbar.'
      ,localTtsProvider: 'qwen3-tts', localTtsReady: false
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
  try {
    if (inTauri()) return await invoke<MediaResult[]>('wikimedia_search', { query, limit });
    return await searchWikimediaHttp(query, limit);
  } catch (primaryError) {
    try {
      return await searchWikimediaHttp(query, limit);
    } catch {
      throw primaryError;
    }
  }
}

async function searchWikimediaHttp(query: string, limit: number): Promise<MediaResult[]> {
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

export function mediaFileUrl(path: string): string {
  return inTauri() ? convertFileSrc(path) : path;
}

export async function createTts(text: string, voice = ''): Promise<string> {
  return invoke<string>('create_tts', { text, voice });
}

export async function localTtsStatus(provider: LocalTtsProvider): Promise<LocalTtsStatus> {
  return invoke<LocalTtsStatus>('local_tts_status', { provider });
}

export async function installLocalTts(provider: LocalTtsProvider): Promise<string> {
  return invoke<string>('install_local_tts', { provider });
}

export async function createLocalTts(text: string, provider: LocalTtsProvider, voice = '', speed = 1): Promise<string> {
  return invoke<string>('create_local_tts', { text, provider, voice, speed });
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
  runtime: 'ollama' | 'mlx' | 'mflux';
  kind: 'llm' | 'image';
};

export const MODEL_CATALOG: ModelCatalogItem[] = [
  { id: 'qwen3.5:4b', name: 'Qwen 3.5 · 4B', description: 'Empfohlenes M1-Profil für Recherche, deutsche Sprechertexte und strukturierte Ausgaben.', size: '~3,0 GB · 4-bit', recommended: true, runtime: 'ollama', kind: 'llm' },
  { id: 'mlx-community/Qwen3.5-4B-MLX-4bit', name: 'Qwen 3.5 · 4B MLX', description: 'Apple-Silicon-optimierte 4-bit MLX-Variante für den lokalen LLM-Adapter.', size: '~3,0 GB · MLX 4-bit', runtime: 'mlx', kind: 'llm' },
  { id: 'flux2-klein-4b', name: 'FLUX.2 Klein · 4B', description: 'Empfohlenes M1-Bildprofil für Text-to-Image und Bildbearbeitung mit MFLUX.', size: '~4,4 GB · MFLUX 4-bit', recommended: true, runtime: 'mflux', kind: 'image' },
  { id: 'llama3.2:3b', name: 'Llama 3.2 · 3B', description: 'Sparsamer Ollama-Einstieg für kleinere Macs.', size: '~2,0 GB', runtime: 'ollama', kind: 'llm' },
  { id: 'mistral:7b', name: 'Mistral · 7B', description: 'Allgemeines Ollama-Modell für lokale Workflows.', size: '~4,1 GB', runtime: 'ollama', kind: 'llm' }
];

export async function pullOllamaModel(model: string, onProgress?: (status: string) => void): Promise<void> {
  await invoke('ollama_pull_model', { model });
}

export async function installOllama(): Promise<string> { return invoke<string>('install_ollama'); }

export async function installFfmpeg(): Promise<string> {
  return invoke<string>('install_ffmpeg');
}
