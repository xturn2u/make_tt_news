import { useMemo, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { installFfmpeg, installOllama, MODEL_CATALOG, pullOllamaModel, type ModelCatalogItem } from '../desktop';
import type { SystemStatus } from '../types';

type Props = { health: SystemStatus | null; logs: string[]; debugMode: boolean; onDebugChange: (enabled: boolean) => void; onRefresh: () => Promise<void>; onClose: () => void };
type ModelProgress = { model: string; status: string; completed?: number; total?: number; percent?: number };

export default function SettingsPanel({ health, logs, debugMode, onDebugChange, onRefresh, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState<ModelProgress | null>(null);
  const models = useMemo(() => MODEL_CATALOG.filter((m) => !query || (m.name + m.description).toLowerCase().includes(query.toLowerCase())), [query]);

  async function installModel(model: ModelCatalogItem) {
    setBusy(model.id);
    setProgress({ model: model.id, status: 'Download wird vorbereitet …', percent: 0 });
    setMessage(`${model.name} wird geladen …`);
    let unlisten: (() => void) | undefined;
    try {
      if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
        unlisten = await listen<ModelProgress>('model-progress', (event) => {
          if (event.payload.model !== model.id) return;
          setProgress(event.payload);
          const percent = typeof event.payload.percent === 'number' ? ` ${Math.round(event.payload.percent)}%` : '';
          setMessage(`${model.name}: ${event.payload.status}${percent}`);
        });
      }
      await pullOllamaModel(model.id);
      setProgress({ model: model.id, status: 'Installation abgeschlossen', percent: 100 });
      setMessage(`${model.name} ist installiert.`);
      await onRefresh();
    } catch (error) {
      setProgress(null);
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      unlisten?.();
      setBusy('');
    }
  }

  async function setupOllama() {
    setBusy('ollama'); setMessage('Local-AI-Runtime wird installiert …');
    try { await installOllama(); setMessage('Ollama wurde installiert und gestartet.'); await onRefresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(''); }
  }

  async function setupFfmpeg() {
    setBusy('ffmpeg'); setMessage('FFmpeg wird eingerichtet …');
    try { const path = await installFfmpeg(); setMessage(`FFmpeg ist bereit: ${path}`); await onRefresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(''); }
  }

  const progressPercent = Math.max(0, Math.min(100, progress?.percent ?? 0));

  return <div className="settings-overlay" role="dialog" aria-modal="true">
    <section className="settings-panel">
      <header className="settings-title"><div><p className="eyebrow">EINSTELLUNGEN</p><h2>Lokale KI & Medien</h2><span>Alles direkt in ContentFlow verwalten</span></div><button className="button ghost" onClick={onClose}>Schließen</button></header>
      <div className="settings-status">
        <div><i className={health?.ollamaAvailable ? 'ready' : ''} /><strong>Local AI</strong><small>{health?.ollamaAvailable ? `${health.ollamaModels.length} Modelle erkannt` : 'Runtime nicht verbunden'}</small></div>
        <div><i className={health?.ffmpegAvailable ? 'ready' : ''} /><strong>FFmpeg</strong><small>{health?.ffmpegAvailable ? 'Installiert und bereit' : 'Noch nicht installiert'}</small></div>
      </div>
      <div className="settings-tool"><div><strong>Local-AI-Runtime</strong><p>ContentFlow lädt Ollama direkt herunter und startet es automatisch.</p><small>{health?.ollamaAvailable ? 'Bereit' : 'Nicht eingerichtet'}</small></div><button className="button primary" disabled={busy !== '' || !!health?.ollamaAvailable} onClick={() => void setupOllama()}>{busy === 'ollama' ? 'Wird installiert …' : health?.ollamaAvailable ? 'Bereit' : 'Einrichten'}</button></div>
      <div className="settings-search"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="KI-Modelle suchen …" /></div>
      <div className="settings-list">{models.map((model) => {
        const installed = !!health?.ollamaModels.some((name) => name === model.id || name.startsWith(model.id + ':'));
        const active = progress?.model === model.id && busy === model.id;
        return <article className="model-card" key={model.id}><div><strong>{model.name}</strong>{model.recommended && <em>Empfohlen</em>}<p>{model.description}</p><small>{model.size} · {installed ? 'Installiert' : 'Noch nicht installiert'}</small>{active && <div className="model-progress"><div className="model-progress-head"><span>{progress?.status ?? 'Lädt …'}</span><span>{progress?.percent != null ? `${Math.round(progress.percent)}%` : '…'}</span></div><div className="model-progress-track"><div className="model-progress-bar" style={{ width: `${progressPercent}%` }} /></div><small>Das Modell wird direkt über die Local-AI-Runtime geladen.</small></div>}</div><button className={installed ? 'button ghost' : 'button primary'} disabled={installed || !!busy} onClick={() => void installModel(model)}>{busy === model.id ? 'Lädt …' : installed ? 'Installiert' : 'Installieren'}</button></article>;
      })}</div>
      <div className="settings-tool"><div><strong>FFmpeg</strong><p>Wird für den Videoexport benötigt. ContentFlow richtet es automatisch ein.</p><small>{health?.ffmpegPath ?? 'Nicht gefunden'}</small></div><button className="button primary" disabled={busy !== '' || !!health?.ffmpegAvailable} onClick={() => void setupFfmpeg()}>{busy === 'ffmpeg' ? 'Wird eingerichtet …' : health?.ffmpegAvailable ? 'Bereit' : 'Einrichten'}</button></div>
      <div className="settings-tool debug-setting"><div><strong>Debugging Report</strong><p>Zeigt ausführliche Laufprotokolle und stellt sie zur Fehleranalyse bereit.</p><small>{debugMode ? 'Aktiv' : 'Kompakt'}</small></div><div className="debug-actions"><button className="button ghost" onClick={() => navigator.clipboard?.writeText(JSON.stringify({ exportedAt: new Date().toISOString(), logs }, null, 2))}>Report kopieren</button><label><input type="checkbox" checked={debugMode} onChange={(event) => onDebugChange(event.target.checked)} /> Aktiv</label></div></div>
      {message && <div className="settings-message">{message}</div>}
      <footer className="settings-foot">Modelle und Medienwerkzeuge werden lokal auf diesem Mac verwaltet. Es sind keine manuellen Terminal-Schritte nötig.</footer>
    </section>
  </div>;
}
