import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { StudioNodeData } from '../types';

type Props = NodeProps & {
  onStartFrom?: (nodeId: string) => void;
  debugStops?: boolean;
  breakpoint?: boolean;
  onToggleBreakpoint?: (nodeId: string) => void;
};

export default function StudioNode({ data, selected, id, onStartFrom, debugStops, breakpoint, onToggleBreakpoint }: Props) {
  const typed = data as StudioNodeData;

  return (
    <div className={`studio-node status-${typed.status} category-${typed.category} ${selected ? 'selected' : ''}`}>
      {typed.acceptsInput && <Handle type="target" position={Position.Left} />}
      <div className="node-icon">{typed.icon}</div>
      <div className="node-copy">
        <small className="node-category">{typed.category}</small>
        <strong>{typed.title}</strong>
        <span>{typed.subtitle}</span>
        {typed.detail && <small className="node-detail">{typed.detail}</small>}
      </div>
      {onStartFrom && <button className="node-start-button" type="button" title="Workflow ab hier starten" onClick={(event) => { event.stopPropagation(); onStartFrom(id); }}>▶</button>}
      {onToggleBreakpoint && <button className={`node-stop-button ${breakpoint ? 'active' : ''}`} type="button" disabled={!debugStops} title={debugStops ? 'Debug-Haltepunkt umschalten' : 'Debug-Haltepunkte in Einstellungen aktivieren'} onClick={(event) => { event.stopPropagation(); onToggleBreakpoint(id); }}>■</button>}
      <div className="node-status-dot" title={typed.status} />
      {typed.providesOutput && <Handle type="source" position={Position.Right} />}
    </div>
  );
}
