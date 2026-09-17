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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function unwrapPackage(value: unknown): unknown {
  const record = asRecord(value);
  if (!record) return value;
  return record.package ?? record.newsPackage ?? record;
}

function listRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const record = asRecord(payload);
  if (!record) return [];
  for (const key of ['packages', 'items', 'data', 'results']) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }
  return [];
}

function normalizeListItem(value: unknown, index: number): StoredPackageListItem | null {
  const record = asRecord(value);
  if (!record) return null;

  const id = String(record.package_id ?? record.id ?? record.packageId ?? `package-${index}`);
  const candidate = unwrapPackage(value);
  const validation = validateNewsPackage(candidate);
  const packageRecord = validation.valid ? validation.package : undefined;

  const meta = asRecord(packageRecord?.meta ?? record.meta);
  const title = String(
    meta?.topic
      ?? record.topic
      ?? record.title
      ?? record.name
      ?? id,
  );

  return { id, title, package: packageRecord };
}

export function StoredPackagePicker({ packageId, storedPackage, onChange }: Props) {
  const listUrl = String(import.meta.env.VITE_NEWS_PACKAGE_LIST_URL || '').trim();
  const detailTemplate = String(import.meta.env.VITE_NEWS_PACKAGE_DETAIL_URL || '').trim();
  const [items, setItems] = useState<StoredPackageListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const selectedValid = useMemo(() => validateNewsPackage(storedPackage).valid, [storedPackage]);

  useEffect(() => {
    if (!listUrl) return;
    let cancelled = false;

    setLoading(true);
    setError('');
    fetch(listUrl, { headers: { Accept: 'application/json' } })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Paketliste konnte nicht geladen werden (${response.status}).`);
        return response.json() as Promise<unknown>;
      })
      .then((payload) => {
        if (cancelled) return;
        setItems(listRows(payload)
          .map(normalizeListItem)
          .filter((item): item is StoredPackageListItem => Boolean(item)));
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [listUrl]);

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

    if (!detailTemplate) {
      setError('Die Paketliste liefert keine vollständigen Pakete. Für die Detaildaten fehlt noch die Lese-URL.');
      return;
    }

    setLoading(true);
    try {
      const detailUrl = detailTemplate.replace('{id}', encodeURIComponent(id));
      const response = await fetch(detailUrl, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`Paket konnte nicht geladen werden (${response.status}).`);
      const payload = await response.json() as unknown;
      const validation = validateNewsPackage(unwrapPackage(payload));
      if (!validation.valid) {
        throw new Error(`Paket entspricht nicht der erwarteten Struktur: ${validation.errors.join(' ')}`);
      }
      onChange('storedPackage', validation.package);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  };

  if (!listUrl) {
    return (
      <div className="store-status warning">
        <strong>Vorhandener Datenspeicher</strong>
        <p>Die Auswahl ist vorbereitet. Es fehlt noch die GET-Leseschnittstelle des bestehenden Studios.</p>
        <small>Benötigt: Paketliste und – falls die Liste keine vollständigen Pakete liefert – einen Detail-Endpunkt.</small>
      </div>
    );
  }

  return (
    <div className="stored-picker">
      <label>
        Vorhandenes Newspaket
        <select value={packageId || ''} onChange={(event) => selectPackage(event.target.value)} disabled={loading}>
          <option value="">{loading ? 'Pakete werden geladen …' : 'Bitte Paket wählen …'}</option>
          {items.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
      </label>
      {selectedValid && <p className="store-ok">✓ Paket vollständig geladen und validiert</p>}
      {error && <p className="store-error">{error}</p>}
    </div>
  );
}
