import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Copy, Download, Pause, Play, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import type {
  ClipAnimation,
  ClipTemplate,
  ProjectAsset,
  ProjectState,
  TimelineClip,
  TimelineLane,
  VersionKey,
} from '../domain/project';
import { uid } from '../domain/project';

type Props = {
  project: ProjectState;
  setProject: React.Dispatch<React.SetStateAction<ProjectState>>;
  version: VersionKey;
};

const W = 1080;
const H = 1920;
const laneLabels: Record<TimelineLane, string> = {
  banner: 'Banner',
  main: 'Main',
  wan: 'B-Roll',
  headline: 'Headline',
  text: 'Text',
  sound: 'Sound',
};
const lanes: TimelineLane[] = ['banner', 'main', 'wan', 'headline', 'text', 'sound'];
const animations: ClipAnimation[] = ['news', 'left', 'right', 'punch', 'drop', 'fade', 'none'];
const templates: ClipTemplate[] = ['broll', 'split', 'story'];

function formatTime(value: number) {
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function compatible(asset: ProjectAsset, lane: TimelineLane) {
  if (lane === 'sound') return asset.kind === 'audio';
  if (lane === 'main') return asset.kind === 'video' || asset.kind === 'image';
  if (lane === 'headline') return ['headline', 'image'].includes(asset.kind);
  if (lane === 'banner') return ['banner', 'image'].includes(asset.kind);
  if (lane === 'wan') return ['video', 'image', 'headline', 'banner'].includes(asset.kind);
  return false;
}

function isImage(asset?: ProjectAsset) {
  return Boolean(asset && !['video', 'audio', 'export'].includes(asset.kind));
}

function animationLabel(value: ClipAnimation) {
  return ({
    news: 'News-Swoop',
    left: 'Spin links',
    right: 'Spin rechts',
    punch: 'Pop & Zoom',
    drop: 'Drop & Swing',
    fade: 'Sanft',
    none: 'Keine',
  } as const)[value];
}

function roundPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function wrapCanvas(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 5);
}

export function StudioWorkspace({ project, setProject, version }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRef = useRef(new Map<string, HTMLImageElement | HTMLVideoElement | HTMLAudioElement>());
  const dragRef = useRef<{
    id: string;
    mode: 'move' | 'left' | 'right';
    x: number;
    start: number;
    duration: number;
  } | null>(null);
  const rafRef = useRef(0);

  const [selected, setSelected] = useState('');
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pickerLane, setPickerLane] = useState<TimelineLane | null>(null);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState('');

  const clips = project.versionFlows[version]?.timeline || [];
  const duration = Math.max(20, ...clips.map(clip => clip.start + clip.duration));
  const selectedClip = clips.find(clip => clip.id === selected);
  const pxPerSec = 30 * zoom;
  const timelineWidth = Math.max(760, duration * pxPerSec);
  const assetMap = useMemo(() => new Map(project.assets.map(asset => [asset.id, asset])), [project.assets]);

  const setTimeline = (updater: (items: TimelineClip[]) => TimelineClip[]) => {
    setProject(current => ({
      ...current,
      versionFlows: {
        ...current.versionFlows,
        [version]: {
          timeline: updater(current.versionFlows[version]?.timeline || []),
        },
      },
    }));
  };

  const patch = (id: string, next: Partial<TimelineClip>) => {
    setTimeline(items => items.map(clip => clip.id === id ? { ...clip, ...next } : clip));
  };

  const remove = (id: string) => {
    setTimeline(items => items.filter(clip => clip.id !== id));
    if (selected === id) setSelected('');
  };

  const duplicate = (clip: TimelineClip) => {
    const copy: TimelineClip = {
      ...clip,
      id: uid('clip'),
      label: `${clip.label} Kopie`,
      start: Math.min(duration, clip.start + Math.min(1, clip.duration / 4)),
    };
    setTimeline(items => [...items, copy]);
    setSelected(copy.id);
  };

  const nextStart = (lane: TimelineLane) => Math.max(
    0,
    ...clips.filter(clip => clip.lane === lane).map(clip => clip.start + clip.duration),
  );

  const defaultDuration = (lane: TimelineLane, asset?: ProjectAsset) => {
    if (lane === 'headline' || lane === 'banner') return 4;
    if (lane === 'wan' && isImage(asset)) return 5;
    if (lane === 'sound') return 15;
    return 10;
  };

  async function probeDuration(asset: ProjectAsset) {
    if (!['video', 'audio'].includes(asset.kind)) return 0;
    return new Promise<number>(resolve => {
      const element = document.createElement(asset.kind === 'video' ? 'video' : 'audio');
      element.preload = 'metadata';
      element.src = asset.url;
      element.onloadedmetadata = () => resolve(Number.isFinite(element.duration) ? element.duration : 0);
      element.onerror = () => resolve(0);
    });
  }

  const addClip = (lane: TimelineLane, asset?: ProjectAsset) => {
    if (lane === 'text') {
      const clip: TimelineClip = {
        id: uid('text'),
        lane,
        label: 'Textfeld',
        text: 'Textfeld',
        start: nextStart(lane),
        duration: 6,
        animation: 'fade',
        x: 540,
        y: 1500,
        scale: 1,
      };
      setTimeline(items => [...items, clip]);
      setSelected(clip.id);
      setPickerLane(null);
      return;
    }

    if (!asset || !compatible(asset, lane)) return;
    const clip: TimelineClip = {
      id: uid('clip'),
      lane,
      assetId: asset.id,
      label: asset.name,
      start: nextStart(lane),
      duration: defaultDuration(lane, asset),
      template: lane === 'wan' ? 'broll' : undefined,
      animation: lane === 'headline' || lane === 'banner' ? 'news' : undefined,
      caption: asset.caption || '',
      scale: 1,
      rotation: 0,
      volume: 1,
    };
    setTimeline(items => [...items, clip]);
    setSelected(clip.id);
    setPickerLane(null);
    void probeDuration(asset).then(mediaDuration => {
      if (mediaDuration > 0 && ['main', 'wan', 'sound'].includes(lane)) {
        patch(clip.id, { duration: Math.min(mediaDuration, 60) });
      }
    });
  };

  function ensureMedia(asset: ProjectAsset) {
    const cached = mediaRef.current.get(asset.id);
    if (cached) return cached;

    if (asset.kind === 'video') {
      const video = document.createElement('video');
      video.src = asset.url;
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      mediaRef.current.set(asset.id, video);
      return video;
    }
    if (asset.kind === 'audio') {
      const audio = new Audio(asset.url);
      audio.preload = 'auto';
      mediaRef.current.set(asset.id, audio);
      return audio;
    }
    const image = new Image();
    image.src = asset.url;
    mediaRef.current.set(asset.id, image);
    return image;
  }

  useEffect(() => {
    project.assets.forEach(asset => { ensureMedia(asset); });
  }, [project.assets]);

  function active(lane: TimelineLane, at: number) {
    return clips
      .filter(clip => clip.lane === lane && at >= clip.start && at < clip.start + clip.duration)
      .sort((a, b) => a.start - b.start)
      .at(-1);
  }

  function drawCover(
    ctx: CanvasRenderingContext2D,
    media: HTMLImageElement | HTMLVideoElement,
    x: number,
    y: number,
    w: number,
    h: number,
    scale = 1,
  ) {
    const mediaWidth = media instanceof HTMLImageElement ? media.naturalWidth : media.videoWidth;
    const mediaHeight = media instanceof HTMLImageElement ? media.naturalHeight : media.videoHeight;
    if (!mediaWidth || !mediaHeight) return;
    const ratio = Math.max(w / mediaWidth, h / mediaHeight) * scale;
    const drawWidth = mediaWidth * ratio;
    const drawHeight = mediaHeight * ratio;
    ctx.drawImage(media, x + (w - drawWidth) / 2, y + (h - drawHeight) / 2, drawWidth, drawHeight);
  }

  function drawContain(
    ctx: CanvasRenderingContext2D,
    media: HTMLImageElement | HTMLVideoElement,
    x: number,
    y: number,
    w: number,
    h: number,
    scale = 1,
    rotation = 0,
    alpha = 1,
  ) {
    const mediaWidth = media instanceof HTMLImageElement ? media.naturalWidth : media.videoWidth;
    const mediaHeight = media instanceof HTMLImageElement ? media.naturalHeight : media.videoHeight;
    if (!mediaWidth || !mediaHeight) return;
    const ratio = Math.min(w / mediaWidth, h / mediaHeight) * scale;
    const drawWidth = mediaWidth * ratio;
    const drawHeight = mediaHeight * ratio;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate(rotation * Math.PI / 180);
    ctx.drawImage(media, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    ctx.restore();
  }

  function animationState(clip: TimelineClip, at: number) {
    const entrance = Math.min(0.6, Math.max(0.2, clip.duration * 0.18));
    const progress = clamp((at - clip.start) / entrance, 0, 1);
    let alpha = 1;
    let scale = clip.scale || 1;
    let rotation = clip.rotation || 0;
    let dx = 0;
    let dy = 0;

    if (clip.animation === 'fade') alpha = progress;
    if (clip.animation === 'news') { dx = (1 - progress) * 180; scale *= 0.82 + 0.18 * progress; }
    if (clip.animation === 'left') rotation += -16 * (1 - progress);
    if (clip.animation === 'right') rotation += 16 * (1 - progress);
    if (clip.animation === 'punch') scale *= 0.72 + 0.28 * progress;
    if (clip.animation === 'drop') dy = -220 * (1 - progress);
    return { alpha, scale, rotation, dx, dy };
  }

  function syncVisual(asset: ProjectAsset, clip: TimelineClip, at: number) {
    const media = ensureMedia(asset);
    if (media instanceof HTMLVideoElement) {
      const local = clamp(at - clip.start, 0, Math.max(0, media.duration || clip.duration));
      if (Math.abs(media.currentTime - local) > 0.12) {
        try { media.currentTime = local; } catch { /* browser may still load metadata */ }
      }
    }
    return media;
  }

  function drawable(media: HTMLImageElement | HTMLVideoElement | HTMLAudioElement): media is HTMLImageElement | HTMLVideoElement {
    return (media instanceof HTMLImageElement && media.complete) ||
      (media instanceof HTMLVideoElement && media.readyState >= 2);
  }

  function renderFrame(at: number) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#070a10';
    ctx.fillRect(0, 0, W, H);

    const main = active('main', at);
    if (main?.assetId) {
      const asset = assetMap.get(main.assetId);
      if (asset) {
        const media = syncVisual(asset, main, at);
        if (drawable(media)) drawCover(ctx, media, 0, 0, W, H, main.scale || 1);
      }
    }

    const wan = active('wan', at);
    if (wan?.assetId) {
      const asset = assetMap.get(wan.assetId);
      if (asset) {
        const media = syncVisual(asset, wan, at);
        if (drawable(media)) {
          const template = wan.template || 'broll';
          if (template === 'broll') {
            drawCover(ctx, media, 0, 0, W, H, wan.scale || 1);
          } else if (template === 'split') {
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, H / 2, W, H / 2);
            ctx.clip();
            drawCover(ctx, media, 0, H / 2, W, H / 2, wan.scale || 1);
            ctx.restore();
          } else {
            ctx.save();
            roundPath(ctx, 90, 360, 900, 1120, 42);
            ctx.clip();
            drawCover(ctx, media, 90, 360, 900, 1120, wan.scale || 1);
            ctx.restore();
            ctx.strokeStyle = 'rgba(255,255,255,.8)';
            ctx.lineWidth = 8;
            roundPath(ctx, 90, 360, 900, 1120, 42);
            ctx.stroke();
          }
          if (wan.caption) {
            ctx.fillStyle = 'rgba(0,0,0,.72)';
            ctx.fillRect(0, H - 150, W, 150);
            ctx.fillStyle = '#fff';
            ctx.font = '700 42px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(wan.caption, W / 2, H - 62);
          }
        }
      }
    }

    const headline = active('headline', at);
    if (headline?.assetId) {
      const asset = assetMap.get(headline.assetId);
      if (asset) {
        const media = ensureMedia(asset);
        if (drawable(media)) {
          const effect = animationState(headline, at);
          drawContain(ctx, media, 50 + effect.dx, 300 + effect.dy, 980, 1180, effect.scale, effect.rotation, effect.alpha);
        }
      }
    }

    const banner = active('banner', at);
    if (banner?.assetId) {
      const asset = assetMap.get(banner.assetId);
      if (asset) {
        const media = ensureMedia(asset);
        if (drawable(media)) {
          const effect = animationState(banner, at);
          drawContain(ctx, media, 60 + effect.dx, 80 + effect.dy, 960, 420, effect.scale, effect.rotation, effect.alpha);
        }
      }
    }

    const text = active('text', at);
    if (text?.text) {
      const effect = animationState(text, at);
      ctx.save();
      ctx.globalAlpha = effect.alpha;
      ctx.fillStyle = 'rgba(0,0,0,.58)';
      ctx.textAlign = 'center';
      ctx.font = `900 ${Math.round(58 * (text.scale || 1))}px Arial`;
      const lines = wrapCanvas(ctx, text.text, 920);
      const boxHeight = lines.length * 70 + 36;
      ctx.fillRect(50, (text.y || 1500) - boxHeight / 2, 980, boxHeight);
      ctx.fillStyle = '#fff';
      lines.forEach((line, index) => {
        ctx.fillText(line, text.x || 540, (text.y || 1500) - ((lines.length - 1) * 35) + index * 70);
      });
      ctx.restore();
    }

    if (!main && !wan && !headline && !banner && !text) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '700 42px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`${version.toUpperCase()} · Timeline ist leer`, W / 2, H / 2);
    }
  }

  useEffect(() => {
    renderFrame(time);
  }, [time, clips, project.assets]);

  useEffect(() => {
    if (!playing) {
      cancelAnimationFrame(rafRef.current);
      return;
    }
    const base = performance.now() - time * 1000;
    const tick = (now: number) => {
      const next = (now - base) / 1000;
      if (next >= duration) {
        setTime(duration);
        setPlaying(false);
        return;
      }
      setTime(next);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, duration]);

  useEffect(() => {
    const sounds = clips.filter(clip => clip.lane === 'sound' && clip.assetId);
    for (const clip of sounds) {
      const asset = assetMap.get(clip.assetId!);
      if (!asset) continue;
      const media = ensureMedia(asset);
      if (!(media instanceof HTMLAudioElement)) continue;
      const isActive = time >= clip.start && time < clip.start + clip.duration;
      if (playing && isActive) {
        media.volume = clamp(clip.volume ?? 1, 0, 1);
        const local = time - clip.start;
        if (Math.abs(media.currentTime - local) > 0.4) media.currentTime = local;
        void media.play().catch(() => undefined);
      } else {
        media.pause();
      }
    }
    return () => {
      sounds.forEach(clip => {
        const asset = clip.assetId ? assetMap.get(clip.assetId) : undefined;
        const media = asset ? mediaRef.current.get(asset.id) : undefined;
        if (media instanceof HTMLAudioElement) media.pause();
      });
    };
  }, [time, playing, clips, assetMap]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const delta = (event.clientX - drag.x) / pxPerSec;
      if (drag.mode === 'move') {
        patch(drag.id, { start: Math.max(0, drag.start + delta) });
      } else if (drag.mode === 'left') {
        const end = drag.start + drag.duration;
        const nextStart = Math.min(end - 0.5, Math.max(0, drag.start + delta));
        patch(drag.id, { start: nextStart, duration: end - nextStart });
      } else {
        patch(drag.id, { duration: Math.max(0.5, drag.duration + delta) });
      }
    };
    const up = () => { dragRef.current = null; };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [pxPerSec]);

  const selectAndTime = (clip: TimelineClip) => {
    setSelected(clip.id);
    setTime(clip.start);
  };

  const startDrag = (
    event: ReactPointerEvent,
    clip: TimelineClip,
    mode: 'move' | 'left' | 'right',
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setSelected(clip.id);
    dragRef.current = {
      id: clip.id,
      mode,
      x: event.clientX,
      start: clip.start,
      duration: clip.duration,
    };
  };

  async function exportVideo() {
    if (exporting) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    setExporting(true);
    setMessage('Export läuft in Echtzeit …');
    setPlaying(false);
    setTime(0);

    try {
      const stream = canvas.captureStream(30);
      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';
      const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
      const chunks: Blob[] = [];
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      const done = new Promise<void>(resolve => { recorder.onstop = () => resolve(); });
      recorder.start(250);
      const start = performance.now();
      await new Promise<void>(resolve => {
        const tick = (now: number) => {
          const current = Math.min(duration, (now - start) / 1000);
          setTime(current);
          renderFrame(current);
          if (current >= duration) {
            resolve();
            return;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      recorder.stop();
      await done;

      const blob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const name = `studio-${version}-${Date.now()}.webm`;
      setProject(current => ({
        ...current,
        assets: [{
          id: uid('export'),
          kind: 'export',
          name,
          url,
          mime: 'video/webm',
          size: blob.size,
          source: 'studio-export',
          version,
        }, ...current.assets],
      }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = name;
      anchor.click();
      setMessage('Export fertig und als gemeinsames Asset gespeichert.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Export fehlgeschlagen.');
    } finally {
      setExporting(false);
    }
  }

  return <div className="studio-v2">
    <div className="studio-topbar">
      <div className="version-context"><b>{version.toUpperCase()}</b><span>Eigene Timeline · gemeinsame Assets</span></div>
      <div className="studio-actions">
        <button onClick={() => { setTime(0); setPlaying(false); }}><RotateCcw size={15}/>Zurück</button>
        <button className="primary" disabled={exporting || !clips.length} onClick={() => void exportVideo()}><Download size={15}/>{exporting ? 'Export …' : 'Export'}</button>
      </div>
    </div>

    <div className="studio-grid">
      <div className="studio-preview-panel">
        <div className="studio-phone">
          <canvas ref={canvasRef} width={W} height={H}/>
          <button className="preview-play" onClick={() => setPlaying(value => !value)}>{playing ? <Pause size={22}/> : <Play size={22}/>}</button>
          <span className="preview-time">{formatTime(time)} / {formatTime(duration)}</span>
        </div>
        {message && <div className="studio-message">{message}</div>}
      </div>

      <div className="studio-shared-assets">
        <div className="studio-panel-head"><div><b>Gemeinsame Assets</b><small>Auf eine Spur ziehen · Doppelklick fügt automatisch hinzu</small></div></div>
        <div className="studio-asset-grid">
          {project.assets.filter(asset => asset.kind !== 'export').map(asset => <button
            key={asset.id}
            draggable
            onDragStart={event => {
              event.dataTransfer.setData('application/asset', asset.id);
              event.dataTransfer.effectAllowed = 'copy';
            }}
            title={asset.name}
            onDoubleClick={() => {
              const target: TimelineLane = asset.kind === 'audio'
                ? 'sound'
                : asset.kind === 'headline'
                  ? 'headline'
                  : asset.kind === 'banner'
                    ? 'banner'
                    : 'wan';
              addClip(target, asset);
            }}
          >
            {asset.kind === 'video'
              ? <video src={asset.url} muted/>
              : asset.kind === 'audio'
                ? <span className="asset-audio">♪</span>
                : <img src={asset.url} alt=""/>}
            <strong>{asset.name}</strong>
          </button>)}
        </div>
      </div>
    </div>

    <div className="timeline-editor">
      <div className="timeline-toolbar">
        <div><button onClick={() => setZoom(value => clamp(value - 0.25, 0.5, 3))}>−</button><span>{Math.round(zoom * 100)}%</span><button onClick={() => setZoom(value => clamp(value + 0.25, 0.5, 3))}>+</button></div>
        <span>{formatTime(time)} / {formatTime(duration)}</span>
      </div>
      <div className="timeline-scroll">
        <div
          className="timeline-content"
          style={{ width: timelineWidth }}
          onPointerDown={event => {
            const rect = event.currentTarget.getBoundingClientRect();
            setTime(clamp((event.clientX - rect.left - 82) / pxPerSec, 0, duration));
          }}
        >
          <div className="timeline-ruler">
            {Array.from({ length: Math.ceil(duration / 5) + 1 }, (_, index) => index * 5).map(mark => <span key={mark} style={{ left: mark * pxPerSec }}>{mark}s</span>)}
          </div>
          <div className="timeline-playhead" style={{ left: 82 + time * pxPerSec }}/>
          {lanes.map(lane => <div className="studio-lane" key={lane}>
            <div className="studio-lane-label"><button onClick={() => setPickerLane(lane)}><Plus size={13}/></button>{laneLabels[lane]}</div>
            <div
              className="studio-lane-track"
              onDragOver={event => event.preventDefault()}
              onDrop={event => {
                event.preventDefault();
                const id = event.dataTransfer.getData('application/asset');
                const asset = project.assets.find(item => item.id === id);
                if (asset) addClip(lane, asset);
              }}
            >
              {clips.filter(clip => clip.lane === lane).map(clip => {
                const asset = clip.assetId ? assetMap.get(clip.assetId) : undefined;
                return <div
                  key={clip.id}
                  className={`studio-clip lane-${lane} ${selected === clip.id ? 'selected' : ''}`}
                  style={{ left: clip.start * pxPerSec, width: Math.max(24, clip.duration * pxPerSec) }}
                  onPointerDown={event => startDrag(event, clip, 'move')}
                  onClick={event => { event.stopPropagation(); selectAndTime(clip); }}
                >
                  {asset && isImage(asset) && <span className="clip-thumb" style={{ backgroundImage: `url(${asset.url})` }}/>} 
                  <span className="resize-handle left" onPointerDown={event => startDrag(event, clip, 'left')}/>
                  <b>{clip.label}</b>
                  <span className="resize-handle right" onPointerDown={event => startDrag(event, clip, 'right')}/>
                </div>;
              })}
            </div>
          </div>)}
        </div>
      </div>
    </div>

    {selectedClip && <div className="clip-inspector">
      <div className="clip-inspector-head">
        <div><span>{laneLabels[selectedClip.lane]}</span><b>{selectedClip.label}</b></div>
        <div><button title="Duplizieren" onClick={() => duplicate(selectedClip)}><Copy size={15}/></button><button className="danger" title="Löschen" onClick={() => remove(selectedClip.id)}><Trash2 size={15}/></button></div>
      </div>
      <div className="clip-fields">
        <label>Start<input type="number" min={0} step={0.1} value={selectedClip.start.toFixed(1)} onChange={event => patch(selectedClip.id, { start: Math.max(0, Number(event.target.value)) })}/></label>
        <label>Dauer<input type="number" min={0.5} step={0.1} value={selectedClip.duration.toFixed(1)} onChange={event => patch(selectedClip.id, { duration: Math.max(0.5, Number(event.target.value)) })}/></label>
        {selectedClip.lane === 'wan' && <label>Fokus<select value={selectedClip.template || 'broll'} onChange={event => patch(selectedClip.id, { template: event.target.value as ClipTemplate })}>{templates.map(value => <option key={value} value={value}>{value === 'broll' ? 'B-Roll Vollbild' : value === 'split' ? 'Split Fokus' : 'Story Window'}</option>)}</select></label>}
        {['headline', 'banner', 'text'].includes(selectedClip.lane) && <label>Animation<select value={selectedClip.animation || 'none'} onChange={event => patch(selectedClip.id, { animation: event.target.value as ClipAnimation })}>{animations.map(value => <option key={value} value={value}>{animationLabel(value)}</option>)}</select></label>}
        {selectedClip.lane === 'wan' && <label className="wide">Caption<input value={selectedClip.caption || ''} onChange={event => patch(selectedClip.id, { caption: event.target.value })} placeholder="z. B. Ähnliche Abbildung / KI generiert"/></label>}
        {selectedClip.lane === 'text' && <label className="wide">Text<input value={selectedClip.text || ''} onChange={event => patch(selectedClip.id, { text: event.target.value })}/></label>}
        {['main', 'wan', 'headline', 'banner', 'text'].includes(selectedClip.lane) && <>
          <label>Skalierung<input type="number" min={0.2} max={5} step={0.1} value={selectedClip.scale || 1} onChange={event => patch(selectedClip.id, { scale: clamp(Number(event.target.value) || 1, 0.2, 5) })}/></label>
          <label>Drehung<input type="number" min={-180} max={180} step={1} value={selectedClip.rotation || 0} onChange={event => patch(selectedClip.id, { rotation: Number(event.target.value) || 0 })}/></label>
        </>}
        {selectedClip.lane === 'sound' && <label>Lautstärke<input type="range" min={0} max={1} step={0.05} value={selectedClip.volume ?? 1} onChange={event => patch(selectedClip.id, { volume: Number(event.target.value) })}/></label>}
      </div>
    </div>}

    {pickerLane && <div className="studio-modal-backdrop" onClick={() => setPickerLane(null)}>
      <div className="studio-modal" onClick={event => event.stopPropagation()}>
        <div className="studio-modal-head"><div><b>{laneLabels[pickerLane]} hinzufügen</b><small>Gemeinsame Assets dieses Projekts</small></div><button onClick={() => setPickerLane(null)}><X size={17}/></button></div>
        {pickerLane === 'text' && <button className="primary full" onClick={() => addClip('text')}>Neues Textfeld</button>}
        <div className="picker-assets">
          {project.assets.filter(asset => compatible(asset, pickerLane)).map(asset => <button key={asset.id} onClick={() => addClip(pickerLane, asset)}>
            {asset.kind === 'video' ? <video src={asset.url} muted/> : asset.kind === 'audio' ? <span className="asset-audio">♪</span> : <img src={asset.url} alt=""/>}
            <strong>{asset.name}</strong>
          </button>)}
        </div>
        {pickerLane !== 'text' && !project.assets.some(asset => compatible(asset, pickerLane)) && <div className="empty-state">Kein passendes gemeinsames Asset vorhanden.</div>}
      </div>
    </div>}
  </div>;
}
