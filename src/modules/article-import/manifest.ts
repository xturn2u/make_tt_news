import type { WorkflowModule } from '../../core/types';

export const articleImportManifest = {
  id: 'article-import',
  name: 'Artikel-Link',
  category: 'Trigger',
  description: 'Lädt einen Artikel über seine URL und stellt den bereinigten Text für den Workflow bereit.',
  color: '#ff4d67',
  version: '1.0.0',
  configFields: [
    {
      key: 'url',
      label: 'Artikel-URL',
      type: 'url',
      placeholder: 'https://www.beispiel.de/artikel',
      required: true,
      description: 'Öffentliche HTTP- oder HTTPS-Adresse des Quellartikels.',
    },
  ],
  inputs: [],
  outputs: [
    { key: 'url', label: 'URL', type: 'string', required: true },
    { key: 'source', label: 'Quelle', type: 'string', required: true },
    { key: 'title', label: 'Titel', type: 'string' },
    { key: 'publishedAt', label: 'Veröffentlicht', type: 'string' },
    { key: 'articleText', label: 'Artikeltext', type: 'string', required: true },
    { key: 'wordCount', label: 'Wörter', type: 'number', required: true },
  ],
} satisfies Omit<WorkflowModule, 'execute'>;
