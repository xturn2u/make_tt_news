export type TripleHeadline = { line1: string; line2: string; line3: string };
export type PovVisual = { art: 'screenshot' | 'pov_video'; timing: string; description: string };
export type NewsVersion = {
  header: string;
  speech_text: string;
  image_prompt: string;
  triple_headline: TripleHeadline;
  description: string;
  hashtags: string[];
  pov_visual: PovVisual;
};

export type VersionKey = 'v1' | 'v2' | 'v3';
export type NewsPackage = {
  source_url: string;
  meta: { topic: string; breaking: boolean };
  versions: Partial<Record<VersionKey, NewsVersion>>;
};

export type AssetKind = 'image' | 'video' | 'audio' | 'headline' | 'banner' | 'export';
export type ProjectAsset = {
  id: string;
  kind: AssetKind;
  name: string;
  url: string;
  mime?: string;
  size?: number;
  source?: string;
  version?: VersionKey;
  caption?: string;
};

export type ResearchLink = { title: string; url: string };
export type VersionResearchState = {
  query: string;
  imageSearchUrl: string;
  links: ResearchLink[];
  status: 'idle' | 'searching' | 'done' | 'error';
  error?: string;
};

export type TimelineLane = 'banner' | 'main' | 'wan' | 'headline' | 'text' | 'sound';
export type ClipTemplate = 'broll' | 'split' | 'story';
export type ClipAnimation = 'news' | 'left' | 'right' | 'punch' | 'drop' | 'fade' | 'none';
export type TimelineClip = {
  id: string;
  lane: TimelineLane;
  assetId?: string;
  label: string;
  start: number;
  duration: number;
  text?: string;
  caption?: string;
  template?: ClipTemplate;
  animation?: ClipAnimation;
  x?: number;
  y?: number;
  scale?: number;
  rotation?: number;
  volume?: number;
};

export type VersionFlowState = {
  timeline: TimelineClip[];
  voiceoverAssetId?: string;
};

export type ProjectState = {
  newsPackage: NewsPackage | null;
  activeVersion: VersionKey;
  /** Shared storage. Version-tagged assets are only offered to the matching studio. */
  assets: ProjectAsset[];
  notes: string;
  versionFlows: Partial<Record<VersionKey, VersionFlowState>>;
  research: Partial<Record<VersionKey, VersionResearchState>>;
  /** Incremented after every JSON import so the canvas can rebuild its branches. */
  workflowRevision: number;
};

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown) => typeof v === 'string' ? v.trim() : '';

function unwrap(input: unknown): unknown {
  if (!isObject(input)) return input;
  for (const key of ['package', 'newsPackage', 'news_package', 'payload', 'data']) {
    if (input[key] !== undefined) {
      const candidate = input[key];
      if (typeof candidate === 'string') {
        try { return JSON.parse(candidate); } catch { /* continue */ }
      }
      if (isObject(candidate)) return candidate;
    }
  }
  return input;
}

function normalizeVersion(raw: unknown, index: number): NewsVersion | null {
  if (!isObject(raw)) return null;
  const triple = isObject(raw.triple_headline) ? raw.triple_headline : {};
  const pov = isObject(raw.pov_visual) ? raw.pov_visual : {};
  const speech = text(raw.speech_text || raw.script || raw.speaker_text || raw.text || raw.body);
  if (!speech) return null;
  const header = text(raw.header || raw.title || raw.hook) || `Version ${index}`;
  const hashtags = Array.isArray(raw.hashtags)
    ? raw.hashtags.map(String).map(v => v.trim()).filter(Boolean).slice(0, 5)
    : text(raw.hashtags).split(/[\s,]+/).filter(Boolean).slice(0, 5);
  const fallback = ['#News', '#Aktuell', '#Nachrichten', '#Deutschland', '#Update'];
  while (hashtags.length < 5) hashtags.push(fallback[hashtags.length]);
  return {
    header: header.slice(0, 90),
    speech_text: speech,
    image_prompt: text(raw.image_prompt || raw.imagePrompt || raw.visual_prompt),
    triple_headline: {
      line1: text(triple.line1) || header,
      line2: text(triple.line2) || header,
      line3: text(triple.line3) || text(raw.description) || header,
    },
    description: text(raw.description || raw.opinion || raw.commentary),
    hashtags,
    pov_visual: {
      art: text(pov.art) === 'pov_video' ? 'pov_video' : 'screenshot',
      timing: text(pov.timing) || 'Sekunde 12–18',
      description: text(pov.description),
    },
  };
}

export const versionKeys: VersionKey[] = ['v1', 'v2', 'v3'];

export function availableVersionKeys(pkg: NewsPackage | null): VersionKey[] {
  if (!pkg) return [];
  return versionKeys.filter(key => Boolean(pkg.versions[key]));
}

export function createVersionFlows(pkg: NewsPackage | null): Partial<Record<VersionKey, VersionFlowState>> {
  return Object.fromEntries(availableVersionKeys(pkg).map(key => [key, { timeline: [] }])) as Partial<Record<VersionKey, VersionFlowState>>;
}

export function createResearchState(pkg: NewsPackage | null): Partial<Record<VersionKey, VersionResearchState>> {
  if (!pkg) return {};
  return Object.fromEntries(availableVersionKeys(pkg).map(key => {
    const version = pkg.versions[key]!;
    const query = version.header || pkg.meta.topic;
    return [key, {
      query,
      imageSearchUrl: `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`,
      links: [],
      status: 'idle' as const,
    }];
  })) as Partial<Record<VersionKey, VersionResearchState>>;
}

export function parsePackageJson(input: string): NewsPackage {
  let raw: unknown;
  const cleaned = input.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try { raw = JSON.parse(cleaned); } catch { throw new Error('Der Input ist kein gültiges JSON.'); }
  const candidate = unwrap(raw);
  if (!isObject(candidate)) throw new Error('Im JSON wurde kein Newspaket gefunden.');

  const source = text(candidate.source_url);
  if (!source) throw new Error('source_url fehlt.');
  try { new URL(source); } catch { throw new Error('source_url ist keine gültige URL.'); }

  const meta = isObject(candidate.meta) ? candidate.meta : {};
  const versionsRaw = candidate.versions;
  const versions: Partial<Record<VersionKey, NewsVersion>> = {};

  if (Array.isArray(versionsRaw)) {
    versionKeys.forEach((key, index) => {
      const normalized = normalizeVersion(versionsRaw[index], index + 1);
      if (normalized) versions[key] = normalized;
    });
  } else if (isObject(versionsRaw)) {
    versionKeys.forEach((key, index) => {
      const normalized = normalizeVersion(versionsRaw[key], index + 1);
      if (normalized) versions[key] = normalized;
    });
  }

  const count = Object.keys(versions).length;
  if (!count) throw new Error('Das Paket enthält keine verwendbare Version mit Sprechtext.');

  return {
    source_url: source,
    meta: {
      topic: text(meta.topic) || 'Newspaket',
      breaking: typeof meta.breaking === 'boolean' ? meta.breaking : false,
    },
    versions,
  };
}

export const emptyProject = (): ProjectState => ({
  newsPackage: null,
  activeVersion: 'v1',
  assets: [],
  notes: '',
  versionFlows: {},
  research: {},
  workflowRevision: 0,
});

export const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
