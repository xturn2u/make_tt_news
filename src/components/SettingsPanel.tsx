import { useMemo, useState } from 'react';
import { installFfmpeg, MODEL_CATALOG, pullOllamaModel, type ModelCatalogItem } from '../desktop';
import type { SystemStatus } from '../types';

type Props = { health: SystemStatus | null; onRefresh: () => Promise<void>; onClose: () => void };

export default function SettingsPanel({ health, onRefresh, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const models = useMemo(() => MODEL_CATALOG.filter((m) => !query || (m.name + m.description).toLowerCase().includes(query.toLowerCase())), [query]);

  async function installModel(model: ModelCatalogItem) {
    setBusy(model.id); setMessage(`${model.name} wird geladen …`);
    try { await pullOllamaModel(model.id); setMessage(`${model.name} ist installiert.`); await onRefresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(''); }
  }

  async function setupFfmpeg() {
    setBusy('ffmpeg'); setMessage('FFmpeg wird eingerichtet …');
    try { const path = await installFfmpeg(); setMessage(`FFmpeg ist bereit: ${path}`); await onRefresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(''); }
  }

  return <div className="settings-overlay" role="dialog" aria-modal="true">
    <section className="settings-panel">
      <header className="settings-title"><div><p className="eyebrow">EINSTELLUNGEN</p><h2>Lokale KI & Medien</h2><span>Alles direkt in ContentFlow verwalten</span></div><button className="button ghost" onClick={onClose}>Schließen</button></header>
      <div className="settings-status">
        <div><i className={health?.ollamaAvailable ? 'ready' : ''} /><strong>Local AI</strong><small>{health?.ollamaAvailable ? `${health.ollamaModels.length} Modelle erkannt` : 'Runtime nicht verbunden'}</small></div>
        <div><i className={health?.ffmpegAvailable ? 'ready' : ''} /><strong>FFmpeg</strong><small>{health?.ffmpegAvailable ? 'Installiert und bereit' : 'Noch nicht installiert'}</small></div>
      </div>
      <div className="settings-search"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="KI-Modelle suchen …" /></div>
      <div className="settings-list">{models.map((model) => {
        const installed = !!health?.ollamaModels.some((name) => name === model.id || name.startsWith(model.id + ':'));
        return <article className="model-card" key={model.id}><div><strong>{model.name}</strong>{model.recommended && <em>Empfohlen</em>}<p>{model.description}</p><small>{model.size} · {installed ? 'Installiert' : 'Noch nicht installiert'}</small></div><button className={installed ? 'button ghost' : 'button primary'} disabled={installed || !!busy} onClick={() => void installModel(model)}>{busy === model.id ? 'Lädt …' : installed ? 'Installiert' : 'Installieren'}</button></article>;
      })}</div>
      <div className="settings-tool"><div><strong>FFmpeg</strong><p>Wird für den Videoexport benötigt. ContentFlow richtet es automatisch ein.</p><small>{health?.ffmpegPath ?? 'Nicht gefunden'}</small></div><button className="button primary" disabled={busy !== '' || !!health?.ffmpegAvailable} onClick={() => void setupFfmpeg()}>{busy === 'ffmpeg' ? 'Wird eingerichtet …' : health?.ffmpegAvailable ? 'Bereit' : 'Einrichten'}</button></div>
      {message && <div className="settings-message">{message}</div>}
      <footer className="settings-foot">Modelle werden lokal auf diesem Mac gespeichert. Deine Artikel und Projekte verlassen die App nicht durch diesen Manager.</footer>
    </section>
  </div>;
}
