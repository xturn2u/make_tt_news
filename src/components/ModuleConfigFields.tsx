import type { ModuleConfigField, WorkflowModule } from '../core/types';

type Props = {
  module: WorkflowModule;
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
};

function currentValue(field: ModuleConfigField, config: Record<string, unknown>) {
  const configured = config[field.key];
  if (configured !== undefined) return configured;
  if (field.defaultValue !== undefined) return field.defaultValue;
  return field.type === 'boolean' ? false : '';
}

function visible(field: ModuleConfigField, config: Record<string, unknown>) {
  if (!field.showWhen) return true;
  const actual = config[field.showWhen.key];
  return actual === field.showWhen.equals;
}

export function ModuleConfigFields({ module, config, onChange }: Props) {
  if (!module.configFields?.length) {
    return <p className="muted">Dieses Modul benötigt keine Konfiguration.</p>;
  }

  return (
    <>
      {module.configFields.filter((field) => visible(field, config)).map((field) => {
        const value = currentValue(field, config);

        if (field.type === 'textarea') {
          return (
            <label key={field.key}>
              {field.label}{field.required ? ' *' : ''}
              <textarea
                value={String(value)}
                placeholder={field.placeholder}
                onChange={(event) => onChange(field.key, event.target.value)}
              />
              {field.description && <small>{field.description}</small>}
            </label>
          );
        }

        if (field.type === 'select') {
          return (
            <label key={field.key}>
              {field.label}{field.required ? ' *' : ''}
              <select value={String(value)} onChange={(event) => onChange(field.key, event.target.value)}>
                {field.options?.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              {field.description && <small>{field.description}</small>}
            </label>
          );
        }

        if (field.type === 'boolean') {
          return (
            <label key={field.key} className="checkbox-field">
              <input
                type="checkbox"
                checked={Boolean(value)}
                onChange={(event) => onChange(field.key, event.target.checked)}
              />
              <span>{field.label}</span>
              {field.description && <small>{field.description}</small>}
            </label>
          );
        }

        return (
          <label key={field.key}>
            {field.label}{field.required ? ' *' : ''}
            <input
              type={field.type === 'number' ? 'number' : field.type === 'url' ? 'url' : 'text'}
              value={String(value)}
              placeholder={field.placeholder}
              min={field.min}
              max={field.max}
              step={field.step}
              required={field.required}
              onChange={(event) => onChange(
                field.key,
                field.type === 'number' ? Number(event.target.value) : event.target.value,
              )}
            />
            {field.description && <small>{field.description}</small>}
          </label>
        );
      })}
    </>
  );
}
