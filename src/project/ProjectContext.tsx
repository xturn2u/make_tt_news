import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { NewsPackage } from '../domain/newsPackage';

export type VersionKey = 'v1' | 'v2' | 'v3';
export type AssetKind = 'image' | 'video' | 'audio' | 'headline' | 'banner' | 'export';

export type LocalAsset = {
  id: string;
  kind: AssetKind;
  name: string;
  url: string;
  mimeType?: string;
  size?: number;
  source?: string;
  createdAt: number;
  file?: File | Blob;
};

export type ProjectSettings = {
  prompterWpm: number;
  soundVolume: number;
  studioDuration: number;
  headlineStyle: 'pressespiegel' | 'pressepunkt';
  headlineAnimation: 'none' | 'news' | 'fade';
  mediaCaption: string;
  replicateToken: string;
};

type ProjectContextValue = {
  newsPackage: NewsPackage | null;
  setNewsPackage: (value: NewsPackage | null) => void;
  selectedVersion: VersionKey;
  setSelectedVersion: (value: VersionKey) => void;
  updateVersion: (key: VersionKey, patch: Partial<NewsPackage['versions'][VersionKey]>) => void;
  assets: LocalAsset[];
  addAsset: (asset: Omit<LocalAsset, 'id' | 'createdAt'> & Partial<Pick<LocalAsset, 'id' | 'createdAt'>>) => LocalAsset;
  addFiles: (files: File[]) => LocalAsset[];
  removeAsset: (id: string) => void;
  clearAssets: () => void;
  settings: ProjectSettings;
  setSettings: (patch: Partial<ProjectSettings>) => void;
};

const STORAGE_PACKAGE = 'project-management.news-package';
const STORAGE_SETTINGS = 'project-management.settings';
const STORAGE_VERSION = 'project-management.version';

const defaultSettings: ProjectSettings = {
  prompterWpm: 145,
  soundVolume: 15,
  studioDuration: 20,
  headlineStyle: 'pressespiegel',
  headlineAnimation: 'none',
  mediaCaption: 'KI generiert',
  replicateToken: '',
};

const ProjectContext = createContext<ProjectContextValue | null>(null);

function readStoredPackage(): NewsPackage | null {
  try {
    const raw = localStorage.getItem(STORAGE_PACKAGE);
    return raw ? JSON.parse(raw) as NewsPackage : null;
  } catch {
    return null;
  }
}

function readStoredSettings(): ProjectSettings {
  try {
    const raw = localStorage.getItem(STORAGE_SETTINGS);
    return raw ? { ...defaultSettings, ...JSON.parse(raw) as Partial<ProjectSettings> } : defaultSettings;
  } catch {
    return defaultSettings;
  }
}

function assetKindFor(file: File): AssetKind {
  const type = file.type.toLowerCase();
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  return 'image';
}

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [newsPackage, setNewsPackageState] = useState<NewsPackage | null>(() => readStoredPackage());
  const [selectedVersion, setSelectedVersionState] = useState<VersionKey>(() => {
    const value = localStorage.getItem(STORAGE_VERSION);
    return value === 'v2' || value === 'v3' ? value : 'v1';
  });
  const [assets, setAssets] = useState<LocalAsset[]>([]);
  const [settings, setSettingsState] = useState<ProjectSettings>(() => readStoredSettings());

  useEffect(() => {
    if (newsPackage) localStorage.setItem(STORAGE_PACKAGE, JSON.stringify(newsPackage));
    else localStorage.removeItem(STORAGE_PACKAGE);
  }, [newsPackage]);

  useEffect(() => {
    localStorage.setItem(STORAGE_VERSION, selectedVersion);
  }, [selectedVersion]);

  useEffect(() => {
    const safe = { ...settings, replicateToken: '' };
    localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(safe));
  }, [settings]);

  const value = useMemo<ProjectContextValue>(() => ({
    newsPackage,
    setNewsPackage: setNewsPackageState,
    selectedVersion,
    setSelectedVersion: setSelectedVersionState,
    updateVersion(key, patch) {
      setNewsPackageState((current) => current ? {
        ...current,
        versions: {
          ...current.versions,
          [key]: { ...current.versions[key], ...patch },
        },
      } : current);
    },
    assets,
    addAsset(input) {
      const asset: LocalAsset = {
        ...input,
        id: input.id || crypto.randomUUID(),
        createdAt: input.createdAt || Date.now(),
      };
      setAssets((current) => [asset, ...current]);
      return asset;
    },
    addFiles(files) {
      const added = files.map((file) => ({
        id: crypto.randomUUID(),
        kind: assetKindFor(file),
        name: file.name,
        url: URL.createObjectURL(file),
        mimeType: file.type,
        size: file.size,
        source: 'upload',
        createdAt: Date.now(),
        file,
      } satisfies LocalAsset));
      setAssets((current) => [...added, ...current]);
      return added;
    },
    removeAsset(id) {
      setAssets((current) => {
        const item = current.find((asset) => asset.id === id);
        if (item?.url.startsWith('blob:')) URL.revokeObjectURL(item.url);
        return current.filter((asset) => asset.id !== id);
      });
    },
    clearAssets() {
      setAssets((current) => {
        current.forEach((item) => { if (item.url.startsWith('blob:')) URL.revokeObjectURL(item.url); });
        return [];
      });
    },
    settings,
    setSettings(patch) {
      setSettingsState((current) => ({ ...current, ...patch }));
    },
  }), [newsPackage, selectedVersion, assets, settings]);

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject() {
  const value = useContext(ProjectContext);
  if (!value) throw new Error('useProject must be used inside ProjectProvider');
  return value;
}
