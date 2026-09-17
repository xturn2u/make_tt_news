import html2canvas from 'html2canvas';
import type { NewsPackage, NewsVersion, ProjectAsset, VersionKey } from '../domain/project';
import { availableVersionKeys, uid } from '../domain/project';

const ORIGINAL_STAGE_WIDTH = 448;
const ORIGINAL_EXPORT_WIDTH = 1016;
const ORIGINAL_CAPTURE_SCALE = ORIGINAL_EXPORT_WIDTH / ORIGINAL_STAGE_WIDTH;

const cleanDescription = (value: string) => String(value || '').replace(/(^|\s)#[\p{L}\p{N}_-]+/gu, ' ').replace(/\s+/g, ' ').trim();
const stripTts = (value: string) => String(value || '').replace(/<\/?(?:emphasis|loud|soft|slow|fast|whisper)>/gi, '').replace(/\[(?:pause|long-pause)\]/gi, '').replace(/\s{2,}/g, ' ').trim();
const firstWords = (value: string, max: number) => stripTts(value).split(/\s+/).filter(Boolean).slice(0, max).join(' ');
const safeName = (value: string) => String(value || 'artikel').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 54) || 'artikel';
const todayDE = () => new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
const cardDate = () => new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date());

function parseHeadline(data: NewsVersion) {
  const lines = [data.triple_headline.line1, data.triple_headline.line2, data.triple_headline.line3].map(v => String(v || '').trim()).filter(Boolean);
  if (lines.length === 1) return { k: '', h: lines[0], s: '' };
  if (lines.length === 2) return { k: lines[0], h: lines[1], s: '' };
  return { k: lines[0] || '', h: lines[1] || data.header, s: lines.slice(2).join(' ') };
}

async function dataUrlBlob(url: string) {
  return (await fetch(url)).blob();
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    } else line = test;
  }
  if (lines.length < maxLines && line) lines.push(line);
  return lines;
}

function drawLines(ctx: CanvasRenderingContext2D, lines: string[], x: number, y: number, lineHeight: number) {
  lines.forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight));
  return y + lines.length * lineHeight;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
}

function createArticleCardUrl(data: NewsVersion, version: VersionKey, style: 'editorial' | 'news' | 'boulevard') {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext('2d')!;
  const card = {
    headline: String(data.header || 'Ohne Überschrift').trim(),
    description: cleanDescription(data.description) || 'Die wichtigsten Informationen dieser Meldung kompakt zusammengefasst.',
    excerpt: firstWords(data.speech_text, 40) || 'Noch kein Sprechertext hinterlegt.',
    date: cardDate(),
  };

  if (style === 'editorial') {
    ctx.fillStyle = '#f6f3ec'; ctx.fillRect(0, 0, 1080, 1350); ctx.fillStyle = '#171717'; ctx.fillRect(0, 0, 1080, 18);
    ctx.font = '800 38px Georgia,serif'; ctx.fillText('DAS JOURNAL', 72, 94); ctx.fillStyle = '#a61f2d'; ctx.fillRect(72, 126, 936, 5);
    ctx.fillStyle = '#6f675d'; ctx.font = '700 22px Arial'; ctx.fillText('NACHRICHTEN  ·  ' + card.date, 72, 178);
    ctx.fillStyle = '#151515'; ctx.font = '900 76px Georgia,serif'; let y = drawLines(ctx, wrapLines(ctx, card.headline, 936, 5), 72, 278, 88) + 28;
    ctx.fillStyle = '#a61f2d'; ctx.fillRect(72, y, 120, 7); y += 50; ctx.fillStyle = '#38342f'; ctx.font = '600 32px Georgia,serif'; y = drawLines(ctx, wrapLines(ctx, card.description, 936, 4), 72, y, 44) + 32;
    ctx.fillStyle = '#6d675f'; ctx.font = '400 27px Georgia,serif'; drawLines(ctx, wrapLines(ctx, card.excerpt, 936, 7), 72, y, 40); ctx.fillStyle = '#171717'; ctx.fillRect(72, 1260, 936, 2);
  } else if (style === 'news') {
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1080, 1350); ctx.fillStyle = '#073f86'; ctx.fillRect(0, 0, 1080, 218); ctx.fillStyle = '#1684d8'; ctx.beginPath(); ctx.arc(930, 80, 210, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '900 43px Arial'; ctx.fillText('NEWS AKTUELL', 68, 92); ctx.font = '600 23px Arial'; ctx.fillText(card.date, 68, 152); ctx.fillStyle = '#0d2745'; ctx.font = '900 68px Arial'; let y = drawLines(ctx, wrapLines(ctx, card.headline, 944, 5), 68, 314, 78) + 30;
    ctx.fillStyle = '#1684d8'; ctx.fillRect(68, y, 944, 7); y += 48; ctx.fillStyle = '#24425f'; ctx.font = '650 31px Arial'; y = drawLines(ctx, wrapLines(ctx, card.description, 944, 4), 68, y, 43) + 34;
    roundRect(ctx, 68, y, 944, Math.min(300, 1350 - y - 120), 20, '#eef5fb'); ctx.fillStyle = '#274761'; ctx.font = '450 27px Arial'; drawLines(ctx, wrapLines(ctx, card.excerpt, 864, 6), 108, y + 58, 40);
  } else {
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1080, 1350); ctx.fillStyle = '#e51b23'; ctx.fillRect(0, 0, 1080, 185); ctx.fillStyle = '#fff'; ctx.font = '950 54px Arial Black,Arial'; ctx.fillText('AKTUELL', 58, 92); ctx.font = '800 24px Arial'; ctx.fillText(card.date, 60, 145);
    roundRect(ctx, 58, 225, 260, 52, 7, '#ffd400'); ctx.fillStyle = '#111'; ctx.font = '950 25px Arial Black,Arial'; ctx.fillText('TOP-MELDUNG', 78, 260); ctx.fillStyle = '#080808'; ctx.font = '950 76px Arial Black,Arial'; let y = drawLines(ctx, wrapLines(ctx, card.headline.toUpperCase(), 964, 5), 58, 368, 84) + 24;
    ctx.fillStyle = '#e51b23'; ctx.fillRect(58, y, 964, 9); y += 48; ctx.fillStyle = '#202020'; ctx.font = '850 31px Arial'; y = drawLines(ctx, wrapLines(ctx, card.description, 964, 4), 58, y, 43) + 28;
    roundRect(ctx, 58, y, 964, Math.min(290, 1350 - y - 105), 14, '#f1f1f1'); ctx.fillStyle = '#333'; ctx.font = '500 27px Arial'; drawLines(ctx, wrapLines(ctx, card.excerpt, 884, 6), 98, y + 52, 40);
  }
  return canvas.toDataURL('image/png');
}

async function createHeadlineAsset(data: NewsVersion, version: VersionKey): Promise<ProjectAsset> {
  const parsed = parseHeadline(data);
  const stage = document.createElement('div');
  stage.className = 'headline-stage headline-hg';
  stage.style.position = 'fixed';
  stage.style.left = '-10000px';
  stage.style.top = '0';
  stage.style.zIndex = '-9999';
  const panel = document.createElement('div'); panel.className = 'headline-panel';
  const kicker = document.createElement('p'); kicker.className = 'headline-kicker'; kicker.textContent = parsed.k;
  const title = document.createElement('h2'); title.textContent = parsed.h || parsed.k;
  panel.append(kicker, title);
  if (parsed.s) { const sub = document.createElement('p'); sub.className = 'headline-sub'; sub.textContent = parsed.s; panel.append(sub); }
  const dateRow = document.createElement('div'); dateRow.className = 'headline-date-row'; const date = document.createElement('span'); date.textContent = todayDE(); dateRow.append(date);
  stage.append(panel, dateRow); document.body.append(stage);
  try {
    if (document.fonts?.ready) await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)));
    const canvas = await html2canvas(stage, { scale: ORIGINAL_CAPTURE_SCALE, backgroundColor: null, useCORS: true, logging: false });
    const blob = await dataUrlBlob(canvas.toDataURL('image/png'));
    return { id: uid('headline'), kind: 'headline', name: `schlagzeile-${version}-${safeName(parsed.h || parsed.k)}.png`, url: URL.createObjectURL(blob), mime: 'image/png', size: blob.size, source: 'headline-generator', version, caption: 'main-headline' };
  } finally { stage.remove(); }
}

async function createArticleAssets(data: NewsVersion, version: VersionKey): Promise<ProjectAsset[]> {
  const styles = ['editorial', 'news', 'boulevard'] as const;
  const assets: ProjectAsset[] = [];
  for (const style of styles) {
    const blob = await dataUrlBlob(createArticleCardUrl(data, version, style));
    assets.push({ id: uid('article'), kind: 'headline', name: `artikel-${safeName(data.header)}-${version}-${style}.png`, url: URL.createObjectURL(blob), mime: 'image/png', size: blob.size, source: 'article-generator', version, caption: `article-${style}` });
  }
  return assets;
}

export async function generatePackageAssets(pkg: NewsPackage): Promise<ProjectAsset[]> {
  const assets: ProjectAsset[] = [];
  for (const version of availableVersionKeys(pkg)) {
    const data = pkg.versions[version];
    if (!data) continue;
    assets.push(await createHeadlineAsset(data, version));
    assets.push(...await createArticleAssets(data, version));
  }
  return assets;
}
