import type { WorkflowModule } from '../../core/types';
import { articleImportManifest } from './manifest';
import { readArticle } from './reader';

export const articleImportModule: WorkflowModule = {
  ...articleImportManifest,
  async execute(input, config, context) {
    const url = String(config.url || input.url || '').trim();
    context.log('Artikel wird geladen und in Text umgewandelt …');

    const article = await readArticle(url);

    context.log(`${article.wordCount} Wörter aus ${article.source} geladen`);
    return article;
  },
};
