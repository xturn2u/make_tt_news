import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { StudioNodeData } from '../types';

export default function StudioNode({ data, selected }: NodeProps) {
  const typed = data as StudioNodeData;
  return (
    <div className={`studio-node status-${typed.status} ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <div className="node-icon">{typed.icon}</div>
      <div className="node-copy">
        <strong>{typed.title}</strong>
        <span>{typed.subtitle}</span>
        {typed.detail && <small>{typed.detail}</small>}
      </div>
      <div className="node-status-dot" title={typed.status} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
