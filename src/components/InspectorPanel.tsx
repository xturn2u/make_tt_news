import type { Node } from '@xyflow/react';
import type { NodeConfig, StudioNodeData, SystemStatus } from '../types';

type Props = {
  node: Node<StudioNodeData> | null;
  health: SystemStatus | null;
  onChangeConfig: (nodeId: string, config: NodeConfig) => void;
  onDelete: (nodeId: string) => void;
};

export default function InspectorPanel({ node, health, onChangeConfig, onDelete }: Props) {
  if (!node) {
    return (
      <aside className="inspector">
        <div className="empty-inspector">
          <div className="empty-icon">◎</div>
          <h3>Node auswählen</h3>
          <p>Klicke auf eine Flow-Karte, um ihre Einstellungen zu bearbeiten.</p>
        </div>
      </aside>
    );
  }

  const config = node.data.config;

  const update = (key: string, value: string | number | boolean) => {
    onChangeConfig(node.id, { ...config, [key]: value });
  };

  return (
    <aside className="inspector">
      <div className="inspector-head">
        <div className="inspector-icon">{node.data.icon}</div>
        <div>
          <p className="eyebrow">{node.data.category}</p>
          <h2>{node.data.title}</h2>
          <span>{node.data.subtitle}</span>
        </div>
      </div>

      <div className="status-card">
        <span className={`status-light status-${node.data.status}`} />
        <div>
          <strong>{statusLabel(node.data.status)}</strong>
          <small>{node.data.detail || 'Noch nicht ausgeführt'}</small>
        </div>
      </div>

      <div className="inspector-fields">
        {Object.entries(config).length === 0 && <p className="muted">Für dieses Modul sind aktuell keine Parameter notwendig.</p>}
        {Object.entries(config).map(([key, value]) => (
          <ConfigField key={key} name={key} value={value} onChange={(next) => update(key, next)} />
        ))}
      </div>

      {node.data.moduleId.includes('agent') && (
        <div className="runtime-card">
          <p className="eyebrow">LOCAL AI</p>
          <strong>{health?.ollamaAvailable ? 'Ollama verbunden' : 'Ollama nicht aktiv'}</strong>
          <small>{health?.ollamaModels.length ? health.ollamaModels.join(', ') : 'Beim Start wird ein lokales Modell gewählt.'}</small>
        </div>
      )}

      <button className="danger-button" onClick={() => onDelete(node.id)}>Node entfernen</button>
    </aside>
  );
}

function ConfigField({ name, value, onChange }: { name: string; value: string | number | boolean; onChange: (value: string | number | boolean) => void }) {
  const label = pretty(name);

  if (typeof value === 'boolean') {
    return (
      <label className="toggle-field">
        <span>{label}</span>
        <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      </label>
    );
  }

  if (typeof value === 'number') {
    return (
      <label className="field">
        <span>{label}</span>
        <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} />
      </label>
    );
  }

  const long = name === 'prompt' || name === 'condition';
  return (
    <label className="field">
      <span>{label}</span>
      {long
        ? <textarea rows={5} value={String(value)} onChange={(e) => onChange(e.target.value)} />
        : <input type={name === 'url' ? 'url' : 'text'} value={String(value)} onChange={(e) => onChange(e.target.value)} />}
    </label>
  );
}

function pretty(value: string) {
  const labels: Record<string, string> = {
    url: 'News URL',
    prompt: 'Agent Prompt',
    duration: 'Ziellänge (Sek.)',
    style: 'Stil',
    scenes: 'Szenen',
    query: 'Suchbegriff',
    limit: 'Max. Assets',
    voice: 'Stimme',
    width: 'Breite',
    height: 'Höhe',
    strict: 'Strenge Prüfung',
    condition: 'Bedingung',
    filename: 'Dateiname'
  };
  return labels[value] ?? value;
}

function statusLabel(status: StudioNodeData['status']) {
  const labels: Record<StudioNodeData['status'], string> = {
    idle: 'Bereit',
    running: 'Wird ausgeführt',
    success: 'Erfolgreich',
    warning: 'Hinweis',
    error: 'Fehler',
    skipped: 'Übersprungen'
  };
  return labels[status];
}
