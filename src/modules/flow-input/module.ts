import type { WorkflowModule } from '../../core/types';
import { validateNewsPackage } from '../../domain/newsPackage';

function parseManualPackage(value: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('Manueller Fallback muss gültiges JSON in der NewsPackage-Datenstruktur sein.');
  }

  const validation = validateNewsPackage(parsed);
  if (!validation.valid) {
    throw new Error(`Manuelles Newspaket ist ungültig:\n- ${validation.errors.join('\n- ')}`);
  }
  return validation.package;
}

export const flowInputModule: WorkflowModule = {
  id: 'flow-input',
  name: 'Flow Input',
  category: 'Input',
  description: 'Liefert genau ein vorhandenes oder manuell eingegebenes Newspaket an den Workflow.',
  color: '#0ea5e9',
  version: '0.3.0',
  configFields: [
    {
      key: 'inputType',
      label: 'Quelle',
      type: 'select',
      defaultValue: 'stored-package',
      options: [
        { label: 'Vorhandenes Newspaket', value: 'stored-package' },
        { label: 'Manuelles Paket · Fallback', value: 'manual-package' },
      ],
      description: 'Im Normalfall wird ein Paket aus dem bestehenden Datenspeicher verwendet.',
    },
    {
      key: 'packageId',
      label: 'Paket-ID',
      type: 'text',
      placeholder: 'Wird durch die Paketauswahl gesetzt',
      description: 'Technische ID des ausgewählten vorhandenen Pakets.',
    },
    {
      key: 'content',
      label: 'Manuelles Newspaket · JSON',
      type: 'textarea',
      placeholder: '{\n  "source_url": "https://…",\n  "meta": { … },\n  "versions": { "v1": …, "v2": …, "v3": … }\n}',
      description: 'Nur als Notlösung. Das JSON muss exakt die definierte NewsPackage-Struktur erfüllen.',
    },
  ],
  outputs: [
    { key: 'inputType', label: 'Input-Typ', type: 'string', required: true },
    { key: 'newsPackage', label: 'Validiertes Newspaket', type: 'NewsPackage', required: true },
    { key: 'packageId', label: 'Paket-ID', type: 'string' },
    { key: 'source', label: 'Quelle', type: 'string', required: true },
  ],
  async execute(_input, config, context) {
    const inputType = String(config.inputType || 'stored-package');

    if (inputType === 'manual-package') {
      const content = String(config.content || '').trim();
      if (!content) throw new Error('Manueller Fallback ist leer. Bitte ein vollständiges NewsPackage-JSON einfügen.');
      const newsPackage = parseManualPackage(content);
      context.log('Manuelles Fallback-Paket validiert und übernommen');
      return {
        inputType,
        newsPackage,
        source: 'manual-fallback',
      };
    }

    const storedPackage = config.storedPackage;
    const packageId = String(config.packageId || '');
    if (!storedPackage || typeof storedPackage !== 'object') {
      throw new Error('Bitte ein vorhandenes Newspaket aus dem Datenspeicher auswählen.');
    }

    const validation = validateNewsPackage(storedPackage);
    if (!validation.valid) {
      throw new Error(`Gespeichertes Newspaket entspricht nicht dem erwarteten Vertrag:\n- ${validation.errors.join('\n- ')}`);
    }

    context.log(`Vorhandenes Newspaket${packageId ? ` ${packageId}` : ''} übernommen`);
    return {
      inputType,
      newsPackage: validation.package,
      packageId: packageId || undefined,
      source: 'existing-store',
    };
  },
};
