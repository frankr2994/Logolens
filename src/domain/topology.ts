import { Trace } from './model';

export interface TopologyNode {
  id: string; // service name
  errorCount: number;
  requestCount: number;
  totalDurationMs: number;
}

export interface TopologyEdge {
  source: string;
  target: string;
  requestCount: number;
  errorCount: number;
}

export function buildTopology(trace: Trace): { nodes: TopologyNode[], edges: TopologyEdge[] } {
  const nodes = new Map<string, TopologyNode>();
  const edges = new Map<string, TopologyEdge>();

  // Ensure all services are nodes
  for (const span of trace.spans) {
    if (!nodes.has(span.serviceName)) {
      nodes.set(span.serviceName, { id: span.serviceName, errorCount: 0, requestCount: 0, totalDurationMs: 0 });
    }
    const node = nodes.get(span.serviceName)!;
    node.requestCount++;
    node.totalDurationMs += span.durationMs;
    
    const isError = span.status.code === 'ERROR' || (span.attributes['http.response.status_code'] as number) >= 500 || (span.attributes['http.status_code'] as number) >= 500;
    if (isError) {
      node.errorCount++;
    }
    
    // Find parent and add edge if parent is from a different service
    if (span.parentSpanId) {
      const parentSpan = trace.indexes?.spanById.get(span.parentSpanId) || trace.spans.find(s => s.spanId === span.parentSpanId);
      if (parentSpan && parentSpan.serviceName !== span.serviceName) {
        const edgeId = `${parentSpan.serviceName}->${span.serviceName}`;
        if (!edges.has(edgeId)) {
          edges.set(edgeId, { source: parentSpan.serviceName, target: span.serviceName, requestCount: 0, errorCount: 0 });
        }
        const edge = edges.get(edgeId)!;
        edge.requestCount++;
        if (isError) edge.errorCount++;
      }
    }
  }

  return { nodes: Array.from(nodes.values()), edges: Array.from(edges.values()) };
}
