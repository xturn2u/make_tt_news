import type { WorkflowModule } from '../../core/types';

function tryParseJson(value: string): unknown | undefined {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

export const flowInputModule: WorkflowModule = {
  id: 'flow-input',
  name: 'Flow Input',
  category: 'Input',
  description: 'Übergibt ein vorhandenes Newspaket oder freien Text an den nächsten Workflow-Schritt.',
  color: '#0ea5e9',
  version: '0.1.0',
  configFields: [
    {
      key: 'inputType',
      label: 'Input-Typ',
      type: 'select',
      defaultValue: 'gpt-sites-package',
      options: [
        { label: 'GPT Sites · Newspaket', value: 'gpt-sites-package' },
        { label: 'Freier Text', value: 'text' },
      ],
      description: 'Legt fest, welche Art von Inhalt an das Newspaket übergeben wird.',
    },
    {
      key: 'content',
      label: 'Flow Input',
      type: 'textarea',
      required: true,
      placeholder: 'Newspaket aus GPT Sites oder freien Text hier einfügen …',
      description: 'JSON wird automatisch erkannt. Normaler Text wird unverändert weitergegeben.',
    },
  ],
  outputs: [
    { key: 'inputType', label: 'Input-Typ', type: 'string', required: true },
    { key: 'rawText', label: 'Rohtext', type: 'string', required: true },
    { key: 'newsPackage', label: 'Strukturiertes Newspaket', type: 'object' },
    { key: 'source', label: 'Quelle', type: 'string', required: true },
  ],
  async execute(_input, config, context) {
    const inputType = String(config.inputType || 'gpt-sites-package');
    const content = String(config.content || '').trim();

    if (!content) {
      throw new Error('Flow Input ist leer. Bitte ein Newspaket oder einen Text einfügen.');
    }

    const parsed = tryParseJson(content);
    const source = inputType === 'gpt-sites-package' ? 'gpt-sites' : 'manual-text';

    context.log(inputType === 'gpt-sites-package'
      ? 'GPT-Sites-Newspaket als Flow Input übernommen'
      : 'Freitext als Flow Input übernommen');

    return {
      inputType,
      rawText: content,
      source,
      ...(parsed && typeof parsed === 'object' ? { newsPackage: parsed } : {}),
    };
  },
};
