import type { WorkflowModule } from '../../core/types';
import { validateNewsPackage, type NewsPackage } from '../../domain/newsPackage';

type ExtractedPackage = {
  newsPackage: NewsPackage;
  packageId?: string;
};

function stripCodeFence(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : trimmed;
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = stripCodeFence(value);
  if (!trimmed) return value;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function packageIdFrom(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const candidate = value.package_id ?? value.packageId ?? value.id ?? value.uuid;
  return candidate === undefined || candidate === null ? undefined : String(candidate);
}

function collectPackages(value: unknown, depth = 0, inheritedId?: string): ExtractedPackage[] {
  if (depth > 5) return [];

  const parsed = parseMaybeJson(value);
  const direct = validateNewsPackage(parsed);
  if (direct.valid) {
    return [{ newsPackage: direct.package, packageId: inheritedId }];
  }

  if (Array.isArray(parsed)) {
    return parsed.flatMap((item) => collectPackages(item, depth + 1, inheritedId));
  }

  if (!isRecord(parsed)) return [];

  const currentId = packageIdFrom(parsed) ?? inheritedId;
  const keys = [
    'package',
    'newsPackage',
    'news_package',
    'payload',
    'package_json',
    'packageJson',
    'json',
    'data',
    'item',
    'record',
  ];

  return keys.flatMap((key) => (
    parsed[key] === undefined
      ? []
      : collectPackages(parsed[key], depth + 1, currentId)
  ));
}

function parseJsonInput(value: string): ExtractedPackage {
  const normalized = stripCodeFence(value);
  let parsed: unknown;
  try {
    parsed = JSON.parse(normalized);
  } catch {
    throw new Error('Der Flow Input ist kein gültiges JSON. Bitte den vollständigen JSON-Export einfügen.');
  }

  const found = collectPackages(parsed);
  const unique = Array.from(new Map(
    found.map((entry) => [JSON.stringify(entry.newsPackage), entry]),
  ).values());

  if (unique.length === 1) return unique[0];

  if (unique.length > 1) {
    throw new Error(
      `Der JSON-Import enthält ${unique.length} vollständige Newspakete. Bitte für diesen Flow genau ein Paket als JSON einfügen.`,
    );
  }

  const rootCandidate = isRecord(parsed) && parsed.package !== undefined ? parsed.package : parsed;
  const validation = validateNewsPackage(parseMaybeJson(rootCandidate));
  const detail = validation.valid ? '' : `\n- ${validation.errors.join('\n- ')}`;
  throw new Error(`Im JSON wurde kein vollständiges NewsPackage gefunden.${detail}`);
}

export const flowInputModule: WorkflowModule = {
  id: 'flow-input',
  name: 'Flow Input',
  category: 'Input',
  description: 'Übernimmt genau ein Newspaket als JSON und validiert es für den Workflow.',
  color: '#0ea5e9',
  version: '0.4.0',
  configFields: [
    {
      key: 'content',
      label: 'Newspaket · JSON Input',
      type: 'textarea',
      required: true,
      placeholder: '{\n  "package": {\n    "source_url": "https://…",\n    "meta": { "topic": "…", "breaking": false },\n    "versions": { "v1": { … }, "v2": { … }, "v3": { … } }\n  }\n}',
      description: 'Akzeptiert sowohl ein direktes NewsPackage als auch den GPT/API-Body { "package": { … } }. JSON-Codeblöcke werden ebenfalls erkannt.',
    },
  ],
  outputs: [
    { key: 'inputType', label: 'Input-Typ', type: 'string', required: true },
    { key: 'newsPackage', label: 'Validiertes Newspaket', type: 'NewsPackage', required: true },
    { key: 'packageId', label: 'Paket-ID', type: 'string' },
    { key: 'source', label: 'Quelle', type: 'string', required: true },
  ],
  async execute(_input, config, context) {
    const content = String(config.content || '').trim();
    if (!content) {
      throw new Error('JSON Input ist leer. Bitte ein vollständiges Newspaket einfügen.');
    }

    const { newsPackage, packageId } = parseJsonInput(content);
    context.log(`JSON-Newspaket${packageId ? ` ${packageId}` : ''} validiert und übernommen`);

    return {
      inputType: 'json',
      newsPackage,
      packageId,
      source: 'json-import',
    };
  },
};
