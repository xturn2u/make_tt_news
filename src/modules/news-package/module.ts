import type { WorkflowModule } from '../../core/types';
import { validateNewsPackage } from '../../domain/newsPackage';

export const newsPackageModule: WorkflowModule = {
  id: 'news-package',
  name: 'Newspaket',
  category: 'Produktion',
  description: 'Übernimmt ein vollständiges NewsPackage aus dem Flow Input und stellt es unverändert bereit.',
  color: '#7c5cff',
  version: '0.3.0',
  inputs: [
    { key: 'newsPackage', label: 'NewsPackage', type: 'NewsPackage', required: true },
    { key: 'packageId', label: 'Paket-ID', type: 'string' },
    { key: 'source', label: 'Quelle', type: 'string' },
  ],
  outputs: [
    { key: 'newsPackage', label: 'NewsPackage', type: 'NewsPackage', required: true },
    { key: 'source_url', label: 'Quell-URL', type: 'string', required: true },
    { key: 'meta', label: 'Meta', type: 'object', required: true },
    { key: 'versions', label: 'Versionen v1–v3', type: 'object', required: true },
    { key: 'packageId', label: 'Paket-ID', type: 'string' },
    { key: 'source', label: 'Quelle', type: 'string', required: true },
  ],
  async execute(input, _config, context) {
    const validation = validateNewsPackage(input.newsPackage);
    if (!validation.valid) {
      throw new Error(`Newspaket benötigt einen gültigen Flow Input:\n- ${validation.errors.join('\n- ')}`);
    }

    const newsPackage = validation.package;
    const packageId = typeof input.packageId === 'string' ? input.packageId : undefined;
    const source = String(input.source || 'workflow-input');

    context.log(`Newspaket "${newsPackage.meta.topic}" übernommen`);

    return {
      newsPackage,
      source_url: newsPackage.source_url,
      meta: newsPackage.meta,
      versions: newsPackage.versions,
      packageId,
      source,
      importedAt: new Date().toISOString(),
    };
  },
};
