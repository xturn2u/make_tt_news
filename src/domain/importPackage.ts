import { validateNewsPackage, type NewsPackage } from './newsPackage';

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : null;
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const text = value.trim();
  if (!text) return value;
  try { return JSON.parse(text) as unknown; } catch { return value; }
}

function cleanJsonText(raw: string) {
  return raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

function findCandidates(value: unknown, out: unknown[], depth = 0) {
  if (depth > 7 || value == null) return;
  const parsed = parseMaybeJson(value);
  const validation = validateNewsPackage(parsed);
  if (validation.valid) {
    out.push(validation.package);
    return;
  }
  if (Array.isArray(parsed)) {
    parsed.forEach((item) => findCandidates(item, out, depth + 1));
    return;
  }
  const obj = record(parsed);
  if (!obj) return;
  const preferred = ['package', 'newsPackage', 'news_package', 'package_json', 'packageJson', 'payload', 'data', 'result'];
  for (const key of preferred) if (key in obj) findCandidates(obj[key], out, depth + 1);
  if (!out.length) Object.values(obj).forEach((item) => findCandidates(item, out, depth + 1));
}

export function importNewsPackage(raw: string): NewsPackage {
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleanJsonText(raw));
  } catch (error) {
    throw new Error(`JSON konnte nicht gelesen werden: ${error instanceof Error ? error.message : String(error)}`);
  }
  const direct = record(parsed);
  if (direct?.package) {
    const nested = parseMaybeJson(direct.package);
    const validation = validateNewsPackage(nested);
    if (validation.valid) return validation.package;
  }
  const validation = validateNewsPackage(parsed);
  if (validation.valid) return validation.package;
  const candidates: unknown[] = [];
  findCandidates(parsed, candidates);
  const unique = candidates.filter((candidate, index, all) => all.findIndex((other) => JSON.stringify(other) === JSON.stringify(candidate)) === index) as NewsPackage[];
  if (unique.length === 1) return unique[0];
  if (unique.length > 1) throw new Error(`Der Export enthält ${unique.length} vollständige Newspakete. Bitte genau ein Paket einfügen.`);
  throw new Error(`Keine gültige Newspaket-Struktur gefunden. ${validation.errors.join(' ')}`);
}
