import type { WorkflowModule } from '../../core/types';

export const newsPackageModule: WorkflowModule = {
  id: 'news-package',
  name: 'Newspaket',
  category: 'Produktion',
  description: 'Erzeugt ein strukturiertes News-Paket aus dem importierten Artikel.',
  color: '#7c5cff',
  async execute(input, _config, context) {
    const source = String(input.source || 'Quelle');
    const articleText = String(input.articleText || '');
    context.log('Newspaket erzeugt');
    return {
      topic: 'Demo-Nachricht',
      summary: articleText.slice(0, 180) || 'Demo-Zusammenfassung',
      source,
      facts: ['Kernaussage 1', 'Kernaussage 2', 'Kernaussage 3'],
    };
  },
};
