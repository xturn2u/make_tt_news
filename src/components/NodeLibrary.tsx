import { CATEGORIES, NODE_CATALOG } from '../flow/catalog';
import type { NodeCategory } from '../types';

type Props = {
  collapsed: boolean;
  onToggle: () => void;
  onAdd: (moduleId: string) => void;
};

export default function NodeLibrary({ collapsed, onToggle, onAdd }: Props) {
  return (
    <aside className={`node-library ${collapsed ? 'collapsed' : ''}`}>
      <button className="library-toggle" onClick={onToggle} aria-label={collapsed ? 'Seitenmenü öffnen' : 'Seitenmenü einklappen'}>{collapsed ? '›' : '‹'}</button>
      {!collapsed && <>
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
