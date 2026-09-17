import { articleImportModule } from '../modules/article-import/module';
import { newsPackageModule } from '../modules/news-package/module';
import { headlineModule } from '../modules/headline-generator/module';
import type { WorkflowModule } from './types';

const placeholder = (id: string, name: string, category: string, color: string, description: string): WorkflowModule => ({
  id, name, category, color, description,
  async execute(input, _config, context) {
    context.log(`${name}: Platzhalter ausgeführt`);
    return { ...input, placeholder: true, module: id };
  },
});

export const moduleRegistry: Record<string, WorkflowModule> = {
  [articleImportModule.id]: articleImportModule,
  [newsPackageModule.id]: newsPackageModule,
  [headlineModule.id]: headlineModule,
  research: placeholder('research', 'Recherche', 'Recherche', '#3b82f6', 'Sammelt und strukturiert Quellen und Hintergrundinformationen.'),
  'asset-check': placeholder('asset-check', 'Asset Check', 'Assets', '#22c55e', 'Prüft, ob benötigte Medien vorhanden sind.'),
  'wait-audio': placeholder('wait-audio', 'Wait for Audio', 'Audio', '#f59e0b', 'Wartet später auf eine Sprachaufnahme.'),
  'wait-video': placeholder('wait-video', 'Wait for Video', 'Video', '#ec4899', 'Wartet später auf Videomaterial.'),
  'auto-render': placeholder('auto-render', 'Auto Render', 'Produktion', '#8b5cf6', 'Startet später den Video-Renderer.'),
  ready: placeholder('ready', 'Ready', 'Output', '#10b981', 'Markiert den Produktionslauf als bereit.'),
};

export const libraryModules = Object.values(moduleRegistry);
