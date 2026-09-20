import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node
} from '@xyflow/react';
import StudioNode from './components/StudioNode';
import {
  createTts,
  ollamaGenerate,
  renderVerticalVideo,
  replicatePredict,
  revealInFinder,
  searchWikimedia,
  systemStatus
} from './desktop';
import type { MediaResult, NodeStatus, ReplicateResult, StudioNodeData, SystemStatus } from './types';

const initialNodes: Node<StudioNodeData>[] = [
  { id: 'input', type: 'studio', position: { x: 40, y: 210 }, data: { title: 'News Input', subtitle: 'Geprüfter Artikeltext', icon: '📰', status: 'idle' } },
  { id: 'ai', type: 'studio', position: { x: 290, y: 210 }, data: { title: 'Local AI', subtitle: 'Ollama → Sprechertext', icon: '✦', status: 'idle' } },
  { id: 'image', type: 'studio', position: { x: 540, y: 120 }, data: { title: 'Bildsuche', subtitle: 'Wikimedia Commons', icon: '⌕', status: 'idle' } },
  { id: 'tts', type: 'studio', position: { x: 540, y: 300 }, data: { title: 'Local TTS', subtitle: 'macOS say', icon: '◖', status: 'idle' } },
  { id: 'replicate', type: 'studio', position: { x: 790, y: 80 }, data: { title: 'Replicate', subtitle: 'optional Img2Video/API', icon: '↗', status: 'idle' } },
  { id: 'render', type: 'studio', position: { x: 790, y: 260 }, data: { title: 'Video Render', subtitle: 'FFmpeg · 1080×1920', icon: '▶', status: 'idle' } },
  { id: 'export', type: 'studio', position: { x: 1040, y: 260 }, data: { title: 'Export', subtitle: 'Lokale MP4', icon: '⇩', status: 'idle' } }
];

const initialEdges: Edge[] = [
  { id: 'e1', source: 'input', target: 'ai', animated: true },
  { id: 'e2', source: 'ai', target: 'image' },
  { id: 'e3', source: 'ai', target: 'tts' },
  { id: 'e4', source: 'image', target: 'replicate' },
  { id: 'e5', source: 'image', target: 'render' },
  { id: 'e6', source: 'tts', target: 'render' },
  { id: 'e7', source: 'render', target: 'export', animated: true }
];

const nodeTypes = { studio: StudioNode };

export default function App() {
  const [nodes, setNodes] = useState(initialNodes);
  const [health, setHealth] = useState<SystemStatus | null>(null);
  const [article, setArticle] = useState('');
  const [script, setScript] = useState('');
  const [model, setModel] = useState('');
  const [imageQuery, setImageQuery] = useState('');
  const [images, setImages] = useState<MediaResult[]>([]);
  const [selectedImage, setSelectedImage] = useState<MediaResult | null>(null);
  const [audioPath, setAudioPath] = useState('');
  const [videoPath, setVideoPath] = useState('');
  const [useReplicate, setUseReplicate] = useState(false);
  const [replicateToken, setReplicateToken] = useState('');
  const [replicateModel, setReplicateModel] = useState('');
  const [replicateInput, setReplicateInput] = useState('{\n  "prompt": "subtle cinematic motion",\n  "image": "__IMAGE_URL__"\n}');
  const [replicateResult, setReplicateResult] = useState<ReplicateResult | null>(null);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>(['Bereit. Systemprüfung wird gestartet …']);

  const addLog = useCallback((message: string) => {
    setLog((old) => [`${new Date().toLocaleTimeString('de-DE')} · ${message}`, ...old].slice(0, 50));
  }, []);

  const setNodeStatus = useCallback((id: string, status: NodeStatus, detail?: string) => {
    setNodes((current) => current.map((node) => node.id === id ? { ...node, data: { ...node.data, status, detail } } : node));
  }, []);

  const refreshHealth = useCallback(async () => {
    try {
      const status = await systemStatus();
      setHealth(status);
      if (!model && status.ollamaModels.length) setModel(status.ollamaModels[0]);
      addLog(`System: TTS ${status.sayAvailable ? 'OK' : 'fehlt'}, FFmpeg ${status.ffmpegAvailable ? 'OK' : 'fehlt'}, Ollama ${status.ollamaAvailable ? 'OK' : 'nicht aktiv'}.`);
    } catch (error) {
      addLog(`Systemprüfung fehlgeschlagen: ${errorText(error)}`);
    }
  }, [addLog, model]);

  useEffect(() => { void refreshHealth(); }, []); // intentionally once

  const searchImages = useCallback(async (queryOverride?: string) => {
    const query = (queryOverride ?? imageQuery).trim();
    if (!query) throw new Error('Bitte einen Suchbegriff angeben.');
    setNodeStatus('image', 'running', query);
    const found = await searchWikimedia(query, 8);
    if (!found.length) {
      setNodeStatus('image', 'warning', 'Keine Treffer');
      throw new Error(`Keine Wikimedia-Bilder für „${query}“ gefunden.`);
    }
    setImages(found);
    setSelectedImage(found[0]);
    setNodeStatus('image', 'success', `${found.length} Treffer`);
    addLog(`${found.length} lizenzierte Wikimedia-Medien gefunden.`);
    return found[0];
  }, [addLog, imageQuery, setNodeStatus]);

  const runWorkflow = useCallback(async () => {
    if (running) return;
    if (!article.trim()) {
      addLog('Abbruch: News Input ist leer.');
      return;
    }

    setRunning(true);
    setVideoPath('');
    setAudioPath('');
    setReplicateResult(null);
    ['input','ai','image','tts','replicate','render','export'].forEach((id) => setNodeStatus(id, 'idle'));

    try {
      setNodeStatus('input', 'success', `${article.trim().split(/\s+/).length} Wörter`);

      let finalScript = script.trim();
      setNodeStatus('ai', 'running', health?.ollamaAvailable && model ? model : 'Fallback');
      if (health?.ollamaAvailable && model) {
        finalScript = await ollamaGenerate(model, buildNewsPrompt(article));
        setScript(finalScript);
        setNodeStatus('ai', 'success', model);
        addLog(`Sprechertext lokal mit ${model} erstellt.`);
      } else {
        finalScript = fallbackScript(article);
        setScript(finalScript);
        setNodeStatus('ai', 'warning', 'Ollama nicht aktiv · sicherer Fallback');
        addLog('Ollama ist nicht aktiv. Der lokale, nicht-generative Fallbacktext wird verwendet.');
      }

      const query = imageQuery.trim() || deriveQuery(article);
      if (!imageQuery.trim()) setImageQuery(query);
      const chosen = selectedImage && images.length ? selectedImage : await searchImages(query);

      setNodeStatus('tts', 'running', 'macOS say');
      const voiceFile = await createTts(finalScript, '');
      setAudioPath(voiceFile);
      setNodeStatus('tts', 'success', 'AIFF erzeugt');
      addLog('TTS vollständig lokal erzeugt.');

      if (useReplicate) {
        if (!replicateToken.trim() || !replicateModel.trim()) {
          setNodeStatus('replicate', 'warning', 'Token/Modell fehlt');
          addLog('Replicate übersprungen: Token oder Modellkennung fehlt.');
        } else {
          setNodeStatus('replicate', 'running', replicateModel);
          const payload = replicateInput.replaceAll('__IMAGE_URL__', chosen.originalUrl);
          const result = await replicatePredict(replicateToken.trim(), replicateModel.trim(), payload);
          setReplicateResult(result);
          setNodeStatus('replicate', result.status === 'failed' ? 'error' : 'success', String(result.status ?? 'gestartet'));
          addLog(`Replicate: ${String(result.status ?? 'Prediction erstellt')}.`);
        }
      } else {
        setNodeStatus('replicate', 'skipped', 'optional');
      }

      if (!health?.ffmpegAvailable) {
        setNodeStatus('render', 'error', 'FFmpeg fehlt');
        throw new Error('FFmpeg fehlt. Einmalig im Terminal „brew install ffmpeg“ ausführen, danach Systemprüfung aktualisieren.');
      }

      setNodeStatus('render', 'running', '1080×1920');
      const movie = await renderVerticalVideo(chosen.originalUrl, voiceFile);
      setVideoPath(movie);
      setNodeStatus('render', 'success', 'MP4 fertig');
      setNodeStatus('export', 'success', movie.split('/').pop() ?? 'MP4');
      addLog('Workflow abgeschlossen: vertikales MP4 wurde lokal gerendert.');
    } catch (error) {
      addLog(`Workflow gestoppt: ${errorText(error)}`);
      const active = nodes.find((n) => n.data.status === 'running');
      if (active) setNodeStatus(active.id, 'error', errorText(error));
    } finally {
      setRunning(false);
      void refreshHealth();
    }
  }, [article, health, imageQuery, images.length, model, nodes, refreshHealth, replicateInput, replicateModel, replicateToken, running, script, searchImages, selectedImage, setNodeStatus, useReplicate, addLog]);

  const healthBadges = useMemo(() => [
    ['Ollama', !!health?.ollamaAvailable],
    ['TTS', !!health?.sayAvailable],
    ['FFmpeg', !!health?.ffmpegAvailable]
  ] as const, [health]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">TN</div>
          <div><strong>TikTok News Studio</strong><span>LOCAL MVP · macOS</span></div>
        </div>
        <div className="system-badges">
          {healthBadges.map(([label, ok]) => <span className={`health ${ok ? 'ok' : 'off'}`} key={label}><i />{label}</span>)}
        </div>
        <div className="top-actions">
          <button className="button ghost" onClick={() => void refreshHealth()}>System prüfen</button>
          <button className="button primary" disabled={running} onClick={() => void runWorkflow()}>{running ? 'Workflow läuft …' : '▶ Workflow ausführen'}</button>
        </div>
      </header>

      <aside className="sidebar">
        <p className="eyebrow">NODE LIBRARY</p>
        {[
          ['📰','News Input','Quelle/Text'],['✦','Local AI','Ollama'],['⌕','Bildsuche','Wikimedia'],['◖','TTS','macOS'],['↗','Replicate','Cloud API'],['▶','Render','FFmpeg'],['⇩','Export','MP4']
        ].map(([icon,title,sub]) => <div className="palette-item" key={title}><span>{icon}</span><div><strong>{title}</strong><small>{sub}</small></div></div>)}
        <div className="sidebar-note"><strong>Prinzip</strong><p>Lokale Funktionen zuerst. Cloud-Nodes sind optional und austauschbar.</p></div>
      </aside>

      <main className="workspace">
        <div className="canvas-panel">
          <div className="canvas-title"><span>NEWS → VIDEO</span><small>Nodes sind frei verschiebbar</small></div>
          <ReactFlow nodes={nodes} edges={initialEdges} nodeTypes={nodeTypes} fitView minZoom={0.55} maxZoom={1.5} nodesDraggable>
            <Background gap={26} size={1} />
            <MiniMap pannable zoomable />
            <Controls />
          </ReactFlow>
        </div>

        <section className="config-panel">
          <div className="section-heading"><div><p className="eyebrow">PROJEKT</p><h2>News Workflow</h2></div><span className="version-pill">v0.1</span></div>

          <label className="field"><span>Geprüfter Nachrichtentext</span><textarea rows={8} value={article} onChange={(e) => setArticle(e.target.value)} placeholder="Hier den geprüften Artikeltext oder deine Faktenbasis einfügen …" /></label>

          <div className="two-col">
            <label className="field"><span>Lokales Modell</span><select value={model} onChange={(e) => setModel(e.target.value)}><option value="">Fallback ohne KI</option>{health?.ollamaModels.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label className="field"><span>Bild-Suchbegriff</span><input value={imageQuery} onChange={(e) => setImageQuery(e.target.value)} placeholder="z. B. Hamburg Polizei" /></label>
          </div>

          <label className="field"><span>Sprechertext</span><textarea rows={6} value={script} onChange={(e) => setScript(e.target.value)} placeholder="Wird durch die lokale KI erzeugt …" /></label>

          <div className="media-box">
            <div className="media-box-head"><strong>Bildquelle</strong><button className="text-button" onClick={() => void searchImages().catch((e) => addLog(errorText(e)))}>Neu suchen</button></div>
            {selectedImage ? <div className="selected-media"><img src={selectedImage.thumbUrl} alt="Ausgewähltes Wikimedia-Medium" /><div><strong>{selectedImage.title}</strong><span>{selectedImage.license}</span><small>{selectedImage.artist}</small></div></div> : <div className="empty-media">Noch kein Medium ausgewählt</div>}
            {images.length > 1 && <div className="thumb-strip">{images.map((image) => <button key={image.originalUrl} className={selectedImage?.originalUrl === image.originalUrl ? 'active' : ''} onClick={() => setSelectedImage(image)}><img src={image.thumbUrl} alt={image.title} /></button>)}</div>}
          </div>

          <details className="advanced"><summary>Replicate · optional</summary><label className="toggle"><input type="checkbox" checked={useReplicate} onChange={(e) => setUseReplicate(e.target.checked)} /><span>Cloud-Node in diesem Lauf verwenden</span></label><label className="field"><span>API Token · nur Sitzung</span><input type="password" value={replicateToken} onChange={(e) => setReplicateToken(e.target.value)} placeholder="r8_…" /></label><label className="field"><span>Modell / Version</span><input value={replicateModel} onChange={(e) => setReplicateModel(e.target.value)} placeholder="owner/model oder owner/model:version" /></label><label className="field"><span>Input JSON</span><textarea rows={6} value={replicateInput} onChange={(e) => setReplicateInput(e.target.value)} /></label>{replicateResult && <pre>{JSON.stringify(replicateResult, null, 2)}</pre>}</details>

          {videoPath && <div className="output-card"><div><span>FERTIG</span><strong>{videoPath.split('/').pop()}</strong><small>{videoPath}</small></div><button className="button primary" onClick={() => void revealInFinder(videoPath)}>Im Finder zeigen</button></div>}

          <div className="log"><div className="log-head"><strong>Run Log</strong><span>{log.length}</span></div>{log.map((line, index) => <p key={`${line}-${index}`}>{line}</p>)}</div>
        </section>
      </main>
    </div>
  );
}

function buildNewsPrompt(article: string): string {
  return `Du bist der lokale Skript-Node eines News-Produktionssystems. Verwende ausschließlich die folgenden vom Nutzer geprüften Informationen. Erfinde keine Fakten, Namen, Zahlen oder Ursachen. Erstelle einen präzisen deutschen Sprechertext für ein vertikales News-Video. Maximal 120 Wörter. Kurze, natürliche Sätze. Keine Hashtags, keine Regieanweisungen, kein Markdown. Antworte nur mit dem Sprechertext.\n\nGEPRÜFTE BASIS:\n${article.trim()}`;
}

function fallbackScript(article: string): string {
  const words = article.trim().replace(/\s+/g, ' ').split(' ');
  const cut = words.slice(0, 120).join(' ');
  return cut + (words.length > 120 ? ' …' : '');
}

function deriveQuery(article: string): string {
  const stop = new Set(['dass','eine','einer','eines','einen','einem','und','oder','aber','der','die','das','den','dem','des','ist','sind','war','waren','mit','von','für','auf','im','in','am','an','zu','zur','zum','bei','nach','wie','sich']);
  return article.replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(/\s+/).filter((w) => w.length > 3 && !stop.has(w.toLowerCase())).slice(0, 6).join(' ') || 'Nachrichten Deutschland';
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
