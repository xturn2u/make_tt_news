import type { Edge, Node } from '@xyflow/react';
import type { RunLog, WorkflowNodeData } from './types';
import { moduleRegistry } from './moduleRegistry';

export async function runWorkflow(nodes: Node<WorkflowNodeData>[], edges: Edge[]): Promise<{ logs: RunLog[]; outputs: Record<string, Record<string, unknown>> }> {
  const logs: RunLog[] = [];
  const outputs: Record<string, Record<string, unknown>> = {};
  const incoming = new Map<string, string[]>();
  for (const edge of edges) incoming.set(edge.target, [...(incoming.get(edge.target) || []), edge.source]);

  const ordered = topological(nodes, edges);
  for (const node of ordered) {
    const module = moduleRegistry[node.data.moduleId];
    if (!module) throw new Error(`Unbekanntes Modul: ${node.data.moduleId}`);
    const predecessors = incoming.get(node.id) || [];
    const input = Object.assign({}, ...predecessors.map((id) => outputs[id] || {}));
    logs.push({ nodeId: node.id, moduleId: module.id, status: 'running', message: `${module.name} läuft` });
    try {
      const output = await module.execute(input, node.data.config || {}, {
        projectId: 'dev-project',
        log: (message) => logs.push({ nodeId: node.id, moduleId: module.id, status: 'running', message }),
      });
      outputs[node.id] = output;
      logs.push({ nodeId: node.id, moduleId: module.id, status: 'success', message: `${module.name} abgeschlossen`, output });
    } catch (error) {
      logs.push({ nodeId: node.id, moduleId: module.id, status: 'error', message: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }
  return { logs, outputs };
}

function topological(nodes: Node<WorkflowNodeData>[], edges: Edge[]) {
  const indegree = new Map(nodes.map((n) => [n.id, 0]));
  const next = new Map<string, string[]>();
  edges.forEach(({ source, target }) => {
    indegree.set(target, (indegree.get(target) || 0) + 1);
    next.set(source, [...(next.get(source) || []), target]);
  });
  const queue = nodes.filter((n) => indegree.get(n.id) === 0);
  const result: Node<WorkflowNodeData>[] = [];
  while (queue.length) {
    const node = queue.shift()!;
    result.push(node);
    for (const target of next.get(node.id) || []) {
      indegree.set(target, (indegree.get(target) || 0) - 1);
      if (indegree.get(target) === 0) queue.push(nodes.find((n) => n.id === target)!);
    }
  }
  if (result.length !== nodes.length) throw new Error('Workflow enthält einen Zyklus.');
  return result;
}
