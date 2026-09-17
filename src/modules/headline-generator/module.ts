import type { WorkflowModule } from '../../core/types';

export const headlineModule: WorkflowModule = {
  id: 'headline-generator',
  name: 'Schlagzeilengenerator',
  category: 'GPT',
  description: 'Erstellt mehrere kurze TikTok-Schlagzeilen aus dem Newspaket.',
  color: '#8b5cf6',
  version: '0.1.0',
  configFields: [
    {
      key: 'variants',
      label: 'Varianten',
      type: 'number',
      defaultValue: 5,
      min: 1,
      max: 5,
      step: 1,
      description: 'Anzahl der erzeugten Schlagzeilenvarianten.',
    },
  ],
  async execute(input, config, context) {
    const variants = Math.max(1, Math.min(5, Number(config.variants || 5)));
    const topic = String(input.topic || 'Diese Nachricht');
    const headlines = [
      `${topic}: Das musst du jetzt wissen`,
      `Was hinter ${topic} steckt`,
      `${topic} – die wichtigsten Fakten`,
      `Darum ist ${topic} jetzt relevant`,
      `${topic}: Was sich jetzt ändert`,
    ].slice(0, variants);
    context.log(`${headlines.length} Schlagzeilen erzeugt`);
    return { headline: headlines[0], alternatives: headlines };
  },
};
