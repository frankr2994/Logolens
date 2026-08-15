import { Span } from './model';

export interface SpanNode {
  span: Span;
  children: SpanNode[];
}

export function buildHierarchy(spans: Span[]): { roots: SpanNode[], orphans: SpanNode[], issues: string[] } {
  const issues: string[] = [];
  const map = new Map<string, SpanNode>();

  for (const span of spans) {
    if (map.has(span.spanId)) {
      issues.push(`Duplicate span ID: ${span.spanId}`);
      continue;
    }
    map.set(span.spanId, { span, children: [] });
  }

  const roots: SpanNode[] = [];
  const orphans: SpanNode[] = [];

  for (const node of map.values()) {
    if (node.span.parentSpanId) {
      if (node.span.parentSpanId === node.span.spanId) {
        issues.push(`Span ${node.span.spanId} is self-parenting`);
        orphans.push(node);
        continue;
      }
      const parent = map.get(node.span.parentSpanId);
      if (parent) {
        parent.children.push(node);
      } else {
        issues.push(`Missing parent ${node.span.parentSpanId} for span ${node.span.spanId}`);
        orphans.push(node);
      }
    } else {
      roots.push(node);
    }
  }

  // Detect cycles
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function dfs(nodeId: string): boolean {
    if (recursionStack.has(nodeId)) {
      issues.push(`Cycle detected at span ${nodeId}`);
      return true; // cycle detected
    }
    if (visited.has(nodeId)) {
      return false;
    }
    visited.add(nodeId);
    recursionStack.add(nodeId);

    const node = map.get(nodeId);
    if (node) {
      // iterate in reverse so we can splice out cyclic edges
      for (let i = node.children.length - 1; i >= 0; i--) {
        const child = node.children[i];
        if (dfs(child.span.spanId)) {
          // Break the edge
          node.children.splice(i, 1);
          orphans.push(child);
        }
      }
    }
    recursionStack.delete(nodeId);
    return false;
  }

  for (const root of roots) {
    dfs(root.span.spanId);
  }
  for (const orphan of orphans) {
    if (!visited.has(orphan.span.spanId)) {
      dfs(orphan.span.spanId);
    }
  }
  // Catch disconnected cycles
  for (const nodeId of map.keys()) {
    if (!visited.has(nodeId)) {
      dfs(nodeId);
    }
  }


  // Sort siblings by start time, duration, span ID
  function sortNodes(nodes: SpanNode[]) {
    nodes.sort((a, b) => {
      if (a.span.startTime !== b.span.startTime) {
        return a.span.startTime - b.span.startTime;
      }
      if (a.span.durationMs !== b.span.durationMs) {
        return b.span.durationMs - a.span.durationMs; // longer duration first
      }
      return a.span.spanId.localeCompare(b.span.spanId);
    });
    for (const node of nodes) {
      sortNodes(node.children);
    }
  }

  sortNodes(roots);
  sortNodes(orphans);

  return { roots, orphans, issues };
}
