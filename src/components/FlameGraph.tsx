import React from 'react';
import { SpanNode } from '../domain/hierarchy';

interface FlameGraphProps {
  nodes: SpanNode[];
  totalTraceTimeMs: number;
  traceStartMs: number;
  selectedSpanId?: string;
  onSelect: (spanId: string) => void;
  retainedSpanIds: Set<string>;
}

export function FlameGraph({ nodes, totalTraceTimeMs, traceStartMs, selectedSpanId, onSelect, retainedSpanIds }: FlameGraphProps) {
  // We need to render the nodes recursively, but as absolute positioned rectangles.
  // We'll compute depths.
  
  const blocks: React.ReactNode[] = [];
  
  function renderNode(node: SpanNode, depth: number) {
    if (!retainedSpanIds.has(node.span.spanId)) return;

    const leftPercent = totalTraceTimeMs > 0 ? ((node.span.startTime - traceStartMs) / totalTraceTimeMs) * 100 : 0;
    const widthPercent = totalTraceTimeMs > 0 ? (node.span.durationMs / totalTraceTimeMs) * 100 : 100;
    const isError = node.span.status.code === 'ERROR' || (node.span.attributes['http.response.status_code'] as number) >= 500 || (node.span.attributes['http.status_code'] as number) >= 500;
    const isSelected = selectedSpanId === node.span.spanId;
    
    blocks.push(
      <div
        key={node.span.spanId}
        onClick={(e) => { e.stopPropagation(); onSelect(node.span.spanId); }}
        style={{
          position: 'absolute',
          top: depth * 24,
          left: `${leftPercent}%`,
          width: `${Math.max(widthPercent, 0.1)}%`,
          height: 20,
          backgroundColor: isError ? '#ff4757' : getColor(node.span.serviceName),
          border: isSelected ? '2px solid #fff' : '1px solid rgba(0,0,0,0.2)',
          boxSizing: 'border-box',
          borderRadius: 2,
          cursor: 'pointer',
          overflow: 'hidden',
          fontSize: '10px',
          color: '#fff',
          padding: '0 4px',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
          lineHeight: '18px',
          opacity: 0.9,
          zIndex: isSelected ? 10 : 1
        }}
        title={`${node.span.name} (${node.span.durationMs}ms)`}
      >
        {widthPercent > 2 && node.span.name}
      </div>
    );
    
    for (const child of node.children) {
      renderNode(child, depth + 1);
    }
  }

  for (const root of nodes) {
    renderNode(root, 0);
  }
  
  // Calculate max depth to set container height
  let maxDepth = 0;
  function computeDepth(n: SpanNode, d: number) {
    if (d > maxDepth) maxDepth = d;
    for (const c of n.children) computeDepth(c, d + 1);
  }
  nodes.forEach(n => computeDepth(n, 0));

  return (
    <div style={{ position: 'relative', width: '100%', height: (maxDepth + 1) * 24 + 20, backgroundColor: '#1a1a24', overflowX: 'hidden', overflowY: 'auto', padding: '10px 0' }}>
      {blocks}
    </div>
  );
}

function getColor(serviceName: string) {
  let hash = 0;
  for (let i = 0; i < serviceName.length; i++) {
    hash = serviceName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
  return '#' + '00000'.substring(0, 6 - c.length) + c;
}
