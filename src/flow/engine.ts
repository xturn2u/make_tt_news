import type { Edge, Node } from '@xyflow/react';
import type { StudioNodeData } from '../types';

export type ExecutionPlan = {
  order: string[];
  roots: string[];
};

export function createExecutionPlan(nodes: Node<StudioNodeData>[], edges: Edge[]): ExecutionPlan {
  const ids = new Set(nodes.map((node) => node.id));
  const indegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();

  for (const id of ids) {
    indegree.set(id, 0);
    outgoing.set(id, []);
  }

  for (const edge of edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) continue;
    outgoing.get(edge.source)?.push(edge.target);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }

  const roots = nodes
    .filter((node) => (indegree.get(node.id) ?? 0) === 0)
    .map((node) => node.id);

  const queue = [...roots];
  const order: string[] = [];

  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const target of outgoing.get(id) ?? []) {
      const next = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, next);
      if (next === 0) queue.push(target);
    }
  }

  if (order.length !== nodes.length) {
    throw new Error('Der Flow enthält einen Zyklus. Entferne die Kreisverbindung, bevor du ihn startest.');
  }

  return { order, roots };
}

export function validateNewsFlow(nodes: Node<StudioNodeData>[], edges: Edge[]): string[] {
  const warnings: string[] = [];
  if (!nodes.some((node) => node.data.moduleId === 'news-url')) warnings.push('Es fehlt ein News-URL-Node.');
  if (!nodes.some((node) => node.data.moduleId === 'export')) warnings.push('Es fehlt ein Export-Node.');
  if (!edges.length) warnings.push('Der Flow enthält keine Verbindungen.');
  return warnings;
}
