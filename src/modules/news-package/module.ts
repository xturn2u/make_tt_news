import type { WorkflowModule } from '../../core/types';

export const newsPackageModule: WorkflowModule = {
  id: 'news-package',
  name: 'Newspaket',
  category: 'Produktion',
  description: 'Übernimmt ein vorhandenes GPT-Sites-Newspaket oder freien Text aus einem Flow Input.',
  color: '#7c5cff',
  version: '0.2.0',
  inputs: [
    { key: 'rawText', label: 'Flow Input', type: 'string', required: true },
    { key: 'newsPackage', label: 'Strukturiertes Newspaket', type: 'object' },
    { key: 'source', label: 'Quelle', type: 'string' },
  ],
  outputs: [
    { key: 'newsPackage', label: 'Newspaket', type: 'object', required: true },
    { key: 'packageText', label: 'Paket-Rohtext', type: 'string', required: true },
    { key: 'source', label: 'Quelle', type: 'string', required: true },
    { key: 'format', label: 'Format', type: 'string', required: true },
  ],
  async execute(input, _config, context) {
    const rawText = String(input.rawText || '').trim();
    const structured = input.newsPackage;

    if (!rawText && (!structured || typeof structured !== 'object')) {
      throw new Error('Newspaket benötigt einen Flow Input. Über + einen Input hinzufügen und Inhalt einfügen.');
    }

    const newsPackage = structured && typeof structured === 'object'
      ? structured as Record<string, unknown>
      : { rawText };

    const source = String(input.source || 'workflow-input');
    const format = structured && typeof structured === 'object' ? 'structured' : 'text';

    context.log(format === 'structured'
      ? 'Strukturiertes Newspaket übernommen'
      : 'Text-Input als Newspaket übernommen');

    return {
      ...newsPackage,
      newsPackage,
      packageText: rawText || JSON.stringify(newsPackage),
      source,
      format,
      importedAt: new Date().toISOString(),
    };
  },
};
