export type TripleHeadline = {
  line1: string;
  line2: string;
  line3: string;
};

export type PovVisual = {
  art: 'screenshot' | 'pov_video';
  timing: 'Sekunde 12–18';
  description: string;
};

export type NewsVersion = {
  header: string;
  speech_text: string;
  image_prompt: string;
  triple_headline: TripleHeadline;
  description: string;
  hashtags: string[];
  pov_visual: PovVisual;
};

export type NewsPackage = {
  source_url: string;
  meta: {
    topic: string;
    breaking: boolean;
  };
  versions: {
    v1: NewsVersion;
    v2: NewsVersion;
    v3: NewsVersion;
  };
};

export type PackageValidationResult =
  | { valid: true; package: NewsPackage }
  | { valid: false; errors: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateVersion(value: unknown, path: string, errors: string[]): value is NewsVersion {
  if (!isRecord(value)) {
    errors.push(`${path} fehlt oder ist kein Objekt.`);
    return false;
  }

  for (const key of ['header', 'speech_text', 'image_prompt', 'description'] as const) {
    if (!nonEmptyString(value[key])) errors.push(`${path}.${key} fehlt oder ist leer.`);
  }

  if (typeof value.header === 'string' && value.header.length > 90) {
    errors.push(`${path}.header darf maximal 90 Zeichen lang sein.`);
  }

  const triple = value.triple_headline;
  if (!isRecord(triple)) {
    errors.push(`${path}.triple_headline fehlt oder ist kein Objekt.`);
  } else {
    for (const key of ['line1', 'line2', 'line3'] as const) {
      if (!nonEmptyString(triple[key])) errors.push(`${path}.triple_headline.${key} fehlt oder ist leer.`);
    }
  }

  if (!Array.isArray(value.hashtags) || value.hashtags.length !== 5 || value.hashtags.some((item) => !nonEmptyString(item))) {
    errors.push(`${path}.hashtags muss exakt 5 nicht-leere Einträge enthalten.`);
  }

  const pov = value.pov_visual;
  if (!isRecord(pov)) {
    errors.push(`${path}.pov_visual fehlt oder ist kein Objekt.`);
  } else {
    if (pov.art !== 'screenshot' && pov.art !== 'pov_video') {
      errors.push(`${path}.pov_visual.art muss "screenshot" oder "pov_video" sein.`);
    }
    if (pov.timing !== 'Sekunde 12–18') {
      errors.push(`${path}.pov_visual.timing muss "Sekunde 12–18" sein.`);
    }
    if (!nonEmptyString(pov.description)) {
      errors.push(`${path}.pov_visual.description fehlt oder ist leer.`);
    }
  }

  return errors.length === 0;
}

export function validateNewsPackage(value: unknown): PackageValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ['Newspaket ist kein Objekt.'] };

  if (!nonEmptyString(value.source_url)) {
    errors.push('source_url fehlt oder ist leer.');
  } else {
    try {
      new URL(value.source_url);
    } catch {
      errors.push('source_url ist keine gültige URL.');
    }
  }

  const meta = value.meta;
  if (!isRecord(meta)) {
    errors.push('meta fehlt oder ist kein Objekt.');
  } else {
    if (!nonEmptyString(meta.topic)) errors.push('meta.topic fehlt oder ist leer.');
    if (typeof meta.breaking !== 'boolean') errors.push('meta.breaking muss boolean sein.');
  }

  const versions = value.versions;
  if (!isRecord(versions)) {
    errors.push('versions fehlt oder ist kein Objekt.');
  } else {
    validateVersion(versions.v1, 'versions.v1', errors);
    validateVersion(versions.v2, 'versions.v2', errors);
    validateVersion(versions.v3, 'versions.v3', errors);
  }

  if (errors.length) return { valid: false, errors };
  return { valid: true, package: value as unknown as NewsPackage };
}
