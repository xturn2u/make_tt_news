import { CATEGORIES, NODE_CATALOG } from '../flow/catalog';
import type { NodeCategory } from '../types';

type Props = {
  collapsed: boolean;
  onToggle: () => void;
  onAdd: (moduleId: string) => void;
  projectTitle: string;
  projects: Array<{ id: string; title: string }>;
  onProjectTitleChange: (title: string) => void;
  onLoadProject: (id: string) => void;
  flowTemplates: Array<{ id: string; title: string }>;
  onSaveFlowTemplate: () => void;
  onLoadFlowTemplate: (id: string) => void;
  onNewEmptyFlow: () => void;
};

export default function NodeLibrary({ collapsed, onToggle, onAdd, projectTitle, projects, onProjectTitleChange, onLoadProject, flowTemplates, onSaveFlowTemplate, onLoadFlowTemplate, onNewEmptyFlow }: Props) {
  return (
    <aside className={`node-library ${collapsed ? 'collapsed' : ''}`}>
      <button className="library-toggle" onClick={onToggle} aria-label={collapsed ? 'Seitenmenü öffnen' : 'Seitenmenü einklappen'}>{collapsed ? '›' : '‹'}</button>
      {!collapsed && <>
      <div className="project-store"><p className="eyebrow">PROJEKT & FLOW SPEICHER</p><input value={projectTitle} onChange={(event) => onProjectTitleChange(event.target.value)} placeholder="Projekttitel …" /><small>Automatisch lokal gespeichert</small><div className="flow-store-actions"><button type="button" onClick={onNewEmptyFlow}>Neuer leerer Flow</button><button type="button" onClick={onSaveFlowTemplate}>Flow speichern</button></div>{projects.length > 0 && <div className="project-list">{projects.map((project) => <button type="button" key={project.id} onClick={() => onLoadProject(project.id)}>{project.title}</button>)}</div>}{flowTemplates.length > 0 && <div className="project-list flow-template-list">{flowTemplates.map((flow) => <button type="button" key={flow.id} onClick={() => onLoadFlowTemplate(flow.id)}>↗ {flow.title}</button>)}</div>}</div>
      <div className="library-head">
        <p className="eyebrow">MODULE</p>
        <h2>Flow-Bausteine</h2>
        <span>Drag & Drop oder Doppelklick</span>
      </div>

      <div className="library-scroll">
        {CATEGORIES.map((category) => (
          <LibraryGroup key={category.id} category={category.id} label={category.label} onAdd={onAdd} />
        ))}
      </div>
      </>}
    </aside>
  );
}

function LibraryGroup({ category, label, onAdd }: { category: NodeCategory; label: string; onAdd: (moduleId: string) => void }) {
  const entries = NODE_CATALOG.filter((item) => item.category === category);

  return (
    <section className="library-group">
      <p>{label}</p>
      {entries.map((item) => (
        <div
          className="palette-item"
          key={item.id}
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData('application/x-contentflow-node', item.id);
            event.dataTransfer.effectAllowed = 'move';
          }}
          onDoubleClick={() => onAdd(item.id)}
          title="Auf die Arbeitsfläche ziehen oder per + hinzufügen"
        >
          <span className="palette-icon">{item.icon}</span>
          <div>
            <strong>{item.title}</strong>
            <small>{item.subtitle}</small>
          </div>
          <button className="palette-add" type="button" onClick={() => onAdd(item.id)} aria-label={`${item.title} hinzufügen`}>+</button>
        </div>
      ))}
    </section>
  );
}
