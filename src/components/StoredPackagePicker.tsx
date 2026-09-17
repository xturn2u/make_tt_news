import { useEffect, useMemo, useState } from 'react';
import { validateNewsPackage, type NewsPackage } from '../domain/newsPackage';

type Props = {
  packageId?: string;
  storedPackage?: unknown;
  onChange: (key: string, value: unknown) => void;
};

type StoredPackageListItem = {
  id: string;
  title: string;
  package?: NewsPackage;
};

const STORE_ORIGIN_KEY = 'project-management-store-origin';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) return value;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

function unwrapPackage(value: unknown): unknown {
  const parsed = parseMaybeJson(value);
  const record = asRecord(parsed);
  if (!record) return parsed;

  const candidates = [
    record.package,
    record.newsPackage,
    record.news_package,
    record.payload,
    record.package_json,
    record.packageJson,
    record.data,
  ];

  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) continue;
    const unwrapped = parseMaybeJson(candidate);
    const validation = validateNewsPackage(unwrapped);
    if (validation.valid) return validation.package;
  }

  return parsed;
}

function listRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const record = asRecord(payload);
  if (!record) return [];
  for (const key of ['packages', 'items', 'data', 'results', 'rows', 'records']) {
    const candidate = parseMaybeJson(record[key]);
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function normalizeListItem(value: unknown, index: number): StoredPackageListItem | null {
  const record = asRecord(value);
  if (!record) return null;

  const id = String(
    record.package_id
      ?? record.id
      ?? record.packageId
      ?? record.uuid
      ?? record.key
      ?? `package-${index}`,
  );

  const candidate = unwrapPackage(value);
  const validation = validateNewsPackage(candidate);
  const packageRecord = validation.valid ? validation.package : undefined;

  const meta = asRecord(packageRecord?.meta ?? record.meta);
  const title = String(
    meta?.topic
      ?? record.topic
      ?? record.title
      ?? record.name
      ?? record.header
      ?? id,
  );

  return { id, title, package: packageRecord };
}

function normalizedOrigin(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    return parsed.origin;
  } catch {
    return '';
  }
}

function initialOrigin(): string {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = normalizedOrigin(params.get('store') || '');
  if (fromQuery) {
    window.localStorage.setItem(STORE_ORIGIN_KEY, fromQuery);
    return fromQuery;
  }

  const fromEnv = normalizedOrigin(String(import.meta.env.VITE_NEWS_STORE_ORIGIN || ''));
  if (fromEnv) return fromEnv;

  return normalizedOrigin(window.localStorage.getItem(STORE_ORIGIN_KEY) || '');
}

function listCandidates(origin: string): string[] {
  const paths = [
    '/api/packages',
    '/api/gpt-packages',
    '/api/news-packages',
    '/api/package-library',
    '/api/gpt-package',
    '/api/packages/list',
    '/api/gpt-package/list',
    '/api/gpt-package?action=list',
    '/api/gpt-package?list=1',
  ];
  return paths.map((path) => `${origin}${path}`);
}

function detailCandidates(origin: string, listUrl: string, id: string): string[] {
  const safeId = encodeURIComponent(id);
  const baseList = listUrl.split('?')[0].replace(/\/$/, '');
  return Array.from(new Set([
    `${baseList}/${safeId}`,
    `${origin}/api/packages/${safeId}`,
    `${origin}/api/gpt-packages/${safeId}`,
    `${origin}/api/news-packages/${safeId}`,
    `${origin}/api/gpt-package/${safeId}`,
    `${origin}/api/package/${safeId}`,
    `${origin}/api/gpt-package?id=${safeId}`,
    `${origin}/api/packages?id=${safeId}`,
  ]));
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    method: 'GET',
    mode: 'cors',
    credentials: 'omit',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<unknown>;
}

export function StoredPackagePicker({ packageId, storedPackage, onChange }: Props) {
  const [storeOrigin, setStoreOrigin] = useState(initialOrigin);
  const [originDraft, setOriginDraft] = useState(storeOrigin);
  const [resolvedListUrl, setResolvedListUrl] = useState('');
  const [items, setItems] = useState<StoredPackageListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const selectedValid = useMemo(() => validateNewsPackage(storedPackage).valid, [storedPackage]);

  useEffect(() => {
    if (!storeOrigin) return;
    let cancelled = false;

    const discover = async () => {
      setLoading(true);
      setError('');
      setResolvedListUrl('');
      setItems([]);

      const errors: string[] = [];
      for (const url of listCandidates(storeOrigin)) {
        try {
          const payload = await fetchJson(url);
          const rows = listRows(payload);
          if (!rows.length) {
            errors.push(`${new URL(url).pathname}: keine Paketliste erkannt`);
            continue;
          }

          const normalized = rows
            .map(normalizeListItem)
            .filter((item): item is StoredPackageListItem => Boolean(item));

          if (!normalized.length) {
            errors.push(`${new URL(url).pathname}: Einträge konnten nicht gelesen werden`);
            continue;
          }

          if (cancelled) return;
          setItems(normalized);
          setResolvedListUrl(url);
          setLoading(false);
          return;
        } catch (reason) {
          const message = reason instanceof Error ? reason.message : String(reason);
          errors.push(`${new URL(url).pathname}: ${message}`);
        }
      }

      if (!cancelled) {
        setLoading(false);
        setError(
          'Keine lesbare Paket-API gefunden. Falls das Studio die Daten nur same-origin ausliefert, benötigen wir einen kleinen API-Proxy/Worker. ' +
          (errors.length ? `Geprüft: ${errors.slice(0, 4).join(' · ')}` : ''),
        );
      }
    };

    void discover();
    return () => { cancelled = true; };
  }, [storeOrigin]);

  const saveOrigin = () => {
    const normalized = normalizedOrigin(originDraft);
    if (!normalized) {
      setError('Bitte eine gültige https:// Adresse des vorhandenen Studios eingeben.');
      return;
    }
    window.localStorage.setItem(STORE_ORIGIN_KEY, normalized);
    setStoreOrigin(normalized);
  };

  const selectPackage = async (id: string) => {
    onChange('packageId', id);
    onChange('storedPackage', undefined);
    setError('');
    if (!id) return;

    const item = items.find((entry) => entry.id === id);
    if (item?.package) {
      onChange('storedPackage', item.package);
      return;
    }

    if (!resolvedListUrl || !storeOrigin) {
      setError('Für dieses Paket konnte keine Detailquelle bestimmt werden.');
      return;
    }

    setLoading(true);
    const failures: string[] = [];
    try {
      for (const detailUrl of detailCandidates(storeOrigin, resolvedListUrl, id)) {
        try {
          const payload = await fetchJson(detailUrl);
          const validation = validateNewsPackage(unwrapPackage(payload));
          if (!validation.valid) {
            failures.push(`${new URL(detailUrl).pathname}: Struktur unvollständig`);
            continue;
          }
          onChange('storedPackage', validation.package);
          setLoading(false);
          return;
        } catch (reason) {
          failures.push(reason instanceof Error ? reason.message : String(reason));
        }
      }
      setError(`Paketliste gefunden, aber Detaildaten für ${id} konnten nicht geladen werden. ${failures.slice(0, 3).join(' · ')}`);
    } finally {
      setLoading(false);
    }
  };

  if (!storeOrigin) {
    return (
      <div className="store-status warning">
        <strong>Vorhandenen Datenspeicher verbinden</strong>
        <p>Die Development-Seite benötigt einmalig die Adresse des bestehenden Studios. Sie wird nur lokal in diesem Browser gespeichert.</p>
        <div className="store-connect">
          <input
            value={originDraft}
            placeholder="https://…"
            onChange={(event) => setOriginDraft(event.target.value)}
          />
          <button type="button" onClick={saveOrigin}>Verbinden</button>
        </div>
        {error && <p className="store-error">{error}</p>}
      </div>
    );
  }

  return (
    <div className="stored-picker">
      <div className="store-connection-row">
        <span className={resolvedListUrl ? 'store-dot online' : 'store-dot'} />
        <small>{resolvedListUrl ? 'Datenspeicher verbunden' : loading ? 'Datenspeicher wird gesucht …' : 'Datenspeicher nicht verbunden'}</small>
        <button
          type="button"
          className="store-change"
          onClick={() => {
            window.localStorage.removeItem(STORE_ORIGIN_KEY);
            setStoreOrigin('');
            setOriginDraft('');
            setItems([]);
            setResolvedListUrl('');
            onChange('packageId', '');
            onChange('storedPackage', undefined);
          }}
        >
          ändern
        </button>
      </div>

      <label>
        Vorhandenes Newspaket
        <select value={packageId || ''} onChange={(event) => void selectPackage(event.target.value)} disabled={loading || !items.length}>
          <option value="">
            {loading ? 'Pakete werden geladen …' : items.length ? 'Bitte Paket wählen …' : 'Keine Pakete geladen'}
          </option>
          {items.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
      </label>

      {selectedValid && <p className="store-ok">✓ Paket vollständig geladen und validiert</p>}
      {error && <p className="store-error">{error}</p>}
    </div>
  );
}
