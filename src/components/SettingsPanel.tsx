import { useMemo, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { createTts, createLocalTts, installFfmpeg, installLocalTts, installOllama, mediaFileUrl, MODEL_CATALOG, pullOllamaModel, type ModelCatalogItem } from '../desktop';
import { LOCAL_TTS_CATALOG, type LocalTtsProvider } from '../localTts';
import type { LocalTtsStatus } from '../localTts';
import type { SystemStatus } from '../types';

type Props = { health: SystemStatus | null; logs: string[]; debugMode: boolean; onDebugChange: (enabled: boolean) => void; debugStops: boolean; onDebugStopsChange: (enabled: boolean) => void; onRefresh: () => Promise<void>; onClose: () => void };
type ModelProgress = { model: string; status: string; completed?: number; total?: number; percent?: number };

export default function SettingsPanel({ health, logs, debugMode, onDebugChange, debugStops, onDebugStopsChange, onRefresh, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [driveFolder, setDriveFolder] = useState(() => localStorage.getItem('contentflow.drive.folder') || '');
  const [progress, setProgress] = useState<ModelProgress | null>(null);
  const [defaultVoice, setDefaultVoice] = useState(() => localStorage.getItem('contentflow.defaultVoice') || '');
  const [previewVoice, setPreviewVoice] = useState('');
  const [previewPath, setPreviewPath] = useState('');
  const [previewBusy, setPreviewBusy] = useState(false);
  const [localProvider, setLocalProvider] = useState<LocalTtsProvider>(() => (localStorage.getItem('contentflow.localTtsProvider') as LocalTtsProvider) || 'qwen3-tts');
  const [localTtsBusy, setLocalTtsBusy] = useState(false);
  const [localStatus, setLocalStatus] = useState<LocalTtsStatus | null>(null);
  const [localVoice, setLocalVoice] = useState(() => localStorage.getItem('contentflow.localVoice') || 'Ryan');
  const models = useMemo(() => MODEL_CATALOG.filter((m) => !query || (m.name + m.description).toLowerCase().includes(query.toLowerCase())), [query]);
  const qwenVoices = ['Ryan', 'Aiden', 'Vivian', 'Serena', 'Dylan', 'Eric'];
  useEffect(() => { void localTtsStatus(localProvider).then(setLocalStatus).catch(() => setLocalStatus(null)); }, [localProvider]);

  async function installModel(model: ModelCatalogItem) {
    if (model.runtime !== 'ollama') {
      setMessage(`${model.name} ist im M1-Modellprofil registriert. Der ${model.runtime.toUpperCase()}-Adapter wird separat aktiviert.`);
      return;
    }
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
  const voices = uniqueVoices(health?.ttsVoices ?? []);
  const femaleVoices = voices.filter((voice) => classifyVoice(voice) === 'female');
  const maleVoices = voices.filter((voice) => classifyVoice(voice) === 'male');
  const otherVoices = voices.filter((voice) => classifyVoice(voice) === 'other');
  async function previewSelectedVoice() { if (!previewVoice) return; setPreviewBusy(true); setMessage(`${previewVoice} wird vorgelesen …`); try { const path = await createTts('Dies ist eine kurze Vorschau der ausgewählten Stimme.', previewVoice); setPreviewPath(path); } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); } finally { setPreviewBusy(false); } }
  function saveDefaultVoice(value: string) { setDefaultVoice(value); localStorage.setItem('contentflow.defaultVoice', value); setMessage(value ? `${value} ist jetzt die Standardstimme.` : 'Systemstandard als Standardstimme gespeichert.'); }
  function saveDriveFolder() { localStorage.setItem('contentflow.drive.folder', driveFolder); setMessage('Google-Drive-Ordner für Memory Cards gespeichert.'); }
  async function setupLocalTts(provider: LocalTtsProvider) { setLocalTtsBusy(true); setMessage(`${provider} wird lokal eingerichtet …`); try { await installLocalTts(provider); localStorage.setItem('contentflow.localTtsProvider', provider); setLocalProvider(provider); const status = await localTtsStatus(provider); setLocalStatus(status); setMessage(`${provider} ist lokal installiert und bereit für die Stimmenvorschau.`); } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); } finally { setLocalTtsBusy(false); } }
  async function previewLocalVoice() { setPreviewBusy(true); setMessage(`Lokale ${localVoice}-Stimme wird erzeugt …`); try { const path = await createLocalTts('Dies ist eine kurze Vorschau der lokalen KI-Stimme. Diese Stimme kann später als Standard für deine Videos verwendet werden.', localProvider, localVoice); setPreviewPath(path); setMessage(`${localVoice} ist bereit. Du kannst die Vorschau unten abspielen.`); } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); } finally { setPreviewBusy(false); } }

  return <div className="settings-overlay" role="dialog" aria-modal="true">
    <section className="settings-panel">
      <header className="settings-title"><div><p className="eyebrow">EINSTELLUNGEN</p><h2>Lokale KI & Medien</h2><span>Alles direkt in ContentFlow verwalten</span></div><button className="button ghost" onClick={onClose}>Schließen</button></header>
      <div className="settings-status">
        <div><i className={health?.ollamaAvailable ? 'ready' : ''} /><strong>Local AI</strong><small>{health?.ollamaAvailable ? health.ollamaModels.length + ' Modelle erkannt' : 'Runtime nicht verbunden'}</small></div>
        <div><i className={health?.ffmpegAvailable ? 'ready' : ''} /><strong>FFmpeg</strong><small>{health?.ffmpegAvailable ? 'Installiert und bereit' : 'Noch nicht installiert'}</small></div>
      </div>
      <div className="settings-tool voice-settings"><div><strong>Standardstimme</strong><p>Stimme für neue TTS-Schritte und die Vorschau.</p></div><div className="voice-controls"><select value={defaultVoice} onChange={(event) => saveDefaultVoice(event.target.value)}><option value="">Systemstandard</option>{femaleVoices.length > 0 && <optgroup label="Weiblich">{femaleVoices.map((voice) => <option key={"f-"+voice} value={voice}>{voice}</option>)}</optgroup>}{maleVoices.length > 0 && <optgroup label="Männlich">{maleVoices.map((voice) => <option key={"m-"+voice} value={voice}>{voice}</option>)}</optgroup>}{otherVoices.length > 0 && <optgroup label="Weitere">{otherVoices.map((voice) => <option key={"o-"+voice} value={voice}>{voice}</option>)}</optgroup>}</select><div className="voice-preview-row"><select value={previewVoice} onChange={(event) => setPreviewVoice(event.target.value)}><option value="">Stimme für Vorschau wählen …</option>{voices.map((voice) => <option key={"p-"+voice} value={voice}>{voice}</option>)}</select><button className="button ghost" disabled={!previewVoice || previewBusy} onClick={() => void previewSelectedVoice()}>{previewBusy ? "Lädt …" : "▶ Anhören"}</button></div>{previewPath && <audio className="audio-preview" controls autoPlay src={mediaFileUrl(previewPath)} />}</div></div>
      <div className="settings-tool voice-settings"><div><strong>Lokale KI-Stimmen</strong><p>Offline-Sprachsynthese ohne API und ohne Cloud. Qwen3-TTS stellt auswählbare lokale Sprecher bereit.</p><small className={localStatus?.ready ? 'status-ready' : ''}>{localStatus?.ready ? 'Bereit · Stimmen können getestet werden' : localStatus?.message ?? 'Noch nicht eingerichtet'}</small></div><div className="voice-controls"><select value={localProvider} onChange={(event) => setLocalProvider(event.target.value as LocalTtsProvider)}>{LOCAL_TTS_CATALOG.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.size}</option>)}</select>{localProvider === 'qwen3-tts' && <select value={localVoice} onChange={(event) => { setLocalVoice(event.target.value); localStorage.setItem('contentflow.localVoice', event.target.value); }}><optgroup label="Qwen3 Sprecher">{qwenVoices.map((voice) => <option key={voice} value={voice}>{voice}</option>)}</optgroup></select>}<button className="button primary" disabled={localTtsBusy || !!localStatus?.ready} onClick={() => void setupLocalTts(localProvider)}>{localTtsBusy ? 'Wird installiert …' : localStatus?.ready ? 'Installiert' : 'Lokal installieren'}</button><button className="button ghost" disabled={localTtsBusy || previewBusy || !localStatus?.ready} onClick={() => void previewLocalVoice()}>{previewBusy ? 'Erzeuge …' : '▶ Stimme testen'}</button>{previewPath && <audio className="audio-preview" controls autoPlay src={mediaFileUrl(previewPath)} />}</div></div>

      <div className="settings-tool"><div><strong>Local-AI-Runtime</strong><p>ContentFlow lädt Ollama direkt herunter und startet es automatisch.</p><small>{health?.ollamaAvailable ? 'Bereit' : 'Nicht eingerichtet'}</small></div><button className="button primary" disabled={busy !== '' || !!health?.ollamaAvailable} onClick={() => void setupOllama()}>{busy === 'ollama' ? 'Wird installiert …' : health?.ollamaAvailable ? 'Bereit' : 'Einrichten'}</button></div>
      <div className="settings-search"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="KI-Modelle suchen …" /></div>
      <div className="settings-list">{models.map((model) => {
        const installed = !!health?.ollamaModels.some((name) => name === model.id || name.startsWith(model.id + ':'));
        const active = progress?.model === model.id && busy === model.id;
        return <article className="model-card" key={model.id}><div><strong>{model.name}</strong>{model.recommended && <em>Empfohlen</em>}<p>{model.description}</p><small>{model.size} · {installed ? 'Installiert' : 'Noch nicht installiert'}</small>{active && <div className="model-progress"><div className="model-progress-head"><span>{progress?.status ?? 'Lädt …'}</span><span>{progress?.percent != null ? `${Math.round(progress.percent)}%` : '…'}</span></div><div className="model-progress-track"><div className="model-progress-bar" style={{ width: `${progressPercent}%` }} /></div><small>Das Modell wird direkt über die Local-AI-Runtime geladen.</small></div>}</div><button className={installed ? 'button ghost' : 'button primary'} disabled={installed || !!busy || model.runtime !== 'ollama'} onClick={() => void installModel(model)}>{busy === model.id ? 'Lädt …' : installed ? 'Installiert' : model.runtime === 'ollama' ? 'Installieren' : model.runtime === 'mlx' ? 'MLX-Adapter' : 'MFLUX-Adapter'}</button></article>;
      })}</div>
      <div className="settings-tool"><div><strong>FFmpeg</strong><p>Wird für den Videoexport benötigt. ContentFlow richtet es automatisch ein.</p><small>{health?.ffmpegPath ?? 'Nicht gefunden'}</small></div><button className="button primary" disabled={busy !== '' || !!health?.ffmpegAvailable} onClick={() => void setupFfmpeg()}>{busy === 'ffmpeg' ? 'Wird eingerichtet …' : health?.ffmpegAvailable ? 'Bereit' : 'Einrichten'}</button></div>
      <div className="drive-card"><strong>Google Drive · Memory Cards</strong><p>Ordner für Bilder und Videos hinterlegen. Die Materialquelle wird für kommende Memory-Card-Schritte gespeichert.</p><input value={driveFolder} onChange={(event) => setDriveFolder(event.target.value)} placeholder="Google-Drive-Ordner-URL …" /><button className="button ghost" onClick={saveDriveFolder}>Ordner verknüpfen</button></div>
      <div className="settings-tool debug-setting"><div><strong>Debugging Report</strong><p>Zeigt ausführliche Laufprotokolle und stellt sie zur Fehleranalyse bereit.</p><small>{debugMode ? 'Aktiv' : 'Kompakt'}</small></div><div className="debug-actions"><button className="button ghost" onClick={() => navigator.clipboard?.writeText(JSON.stringify({ exportedAt: new Date().toISOString(), logs }, null, 2))}>Report kopieren</button><label><input type="checkbox" checked={debugMode} onChange={(event) => onDebugChange(event.target.checked)} /> Report</label><label><input type="checkbox" checked={debugStops} onChange={(event) => onDebugStopsChange(event.target.checked)} /> Haltepunkte</label></div></div>
      {message && <div className="settings-message">{message}</div>}
      <footer className="settings-foot">Modelle und Medienwerkzeuge werden lokal auf diesem Mac verwaltet. Es sind keine manuellen Terminal-Schritte nötig.</footer>
    </section>
  </div>;
}
function uniqueVoices(voices: string[]) { return Array.from(new Set(voices.map((voice) => voice.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'de')); }
function classifyVoice(voice: string): 'female' | 'male' | 'other' { const name = voice.toLowerCase(); const female = ['anna','samantha','victoria','karen','moira','tessa','fiona','zoe','amelie','helena','yuna','kyoko','milena','nora','ava','allison','susan','veena','siri','female']; const male = ['alex','markus','thomas','daniel','fred','ralph','oliver','michael','jorge','diego','luca','male']; if (female.some((item) => name === item || name.startsWith(item + '_'))) return 'female'; if (male.some((item) => name === item || name.startsWith(item + '_'))) return 'male'; return 'other'; }
