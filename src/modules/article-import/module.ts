import type { WorkflowModule } from '../../core/types';

export const articleImportModule: WorkflowModule = {
  id: 'article-import',
  name: 'Artikel-Link',
  category: 'Trigger',
  description: 'Übernimmt einen Artikel-Link als Workflow-Eingang.',
  color: '#ff4d67',
  async execute(input, config, context) {
    const url = String(config.url || input.url || 'https://www.tagesschau.de/');
    context.log(`Artikel-Link übernommen: ${url}`);
    return {
      url,
      articleText: `Demo-Artikelinhalt für ${url}`,
      source: new URL(url).hostname,
    };
  },
};
