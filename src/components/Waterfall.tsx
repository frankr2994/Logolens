import { SpanNode } from '../domain/hierarchy';

interface WaterfallProps {
  nodes: SpanNode[];
  totalTraceTimeMs: number;
  traceStartMs: number;
  depth?: number;
  selectedSpanId?: string;
  onSelect: (spanId: string) => void;
  retainedSpanIds: Set<string>;
  expandedState: Record<string, boolean>;
  onToggleExpand: (spanId: string) => void;
}

export function Waterfall({ nodes, totalTraceTimeMs, traceStartMs, depth = 0, selectedSpanId, onSelect, retainedSpanIds, expandedState, onToggleExpand }: WaterfallProps) {
  return (
    <div className="waterfall" style={{ position: 'relative' }}>
      {depth === 0 && totalTraceTimeMs > 0 && (
        <div style={{ display: 'flex', borderBottom: '1px solid #444', color: '#888', fontSize: '0.75rem', paddingBottom: 4 }}>
          <div style={{ width: '30%' }}>Timeline ({totalTraceTimeMs}ms)</div>
          <div style={{ flex: 1, position: 'relative' }}>
            {[0, 25, 50, 75, 100].map(pct => (
              <div key={pct} style={{ position: 'absolute', left: `${pct}%`, borderLeft: '1px solid #444', height: '100%', paddingLeft: 2 }}>
                {(totalTraceTimeMs * pct / 100).toFixed(0)}ms
              </div>
            ))}
          </div>
        </div>
      )}
      {nodes.map(node => (
        <WaterfallRow 
          key={node.span.spanId} 
          node={node} 
          totalTraceTimeMs={totalTraceTimeMs} 
          traceStartMs={traceStartMs} 
          depth={depth}
          selectedSpanId={selectedSpanId}
          onSelect={onSelect}
          retainedSpanIds={retainedSpanIds}
          expandedState={expandedState}
          onToggleExpand={onToggleExpand}
        />
      ))}
    </div>
  );
}

function WaterfallRow({ node, totalTraceTimeMs, traceStartMs, depth, selectedSpanId, onSelect, retainedSpanIds, expandedState, onToggleExpand }: any) {
  if (!retainedSpanIds.has(node.span.spanId)) return null;

  const expanded = expandedState[node.span.spanId] !== false;
  
  const leftPercent = totalTraceTimeMs > 0 ? ((node.span.startTime - traceStartMs) / totalTraceTimeMs) * 100 : 0;
  const widthPercent = totalTraceTimeMs > 0 ? (node.span.durationMs / totalTraceTimeMs) * 100 : 100;
  
  const isError = node.span.status.code === 'ERROR' || node.span.attributes['http.response.status_code'] >= 500;
  const isSelected = selectedSpanId === node.span.spanId;

  return (
    <>
      <div 
        onClick={() => onSelect(node.span.spanId)}
        style={{
          display: 'flex',
          borderBottom: '1px solid #333',
          padding: '4px 0',
          cursor: 'pointer',
          backgroundColor: isSelected ? '#2a2a40' : 'transparent',
          color: isError ? '#ff6b6b' : 'inherit'
        }}
      >
        <div style={{ width: '30%', paddingLeft: depth * 15 + 'px', display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
          {node.children.length > 0 ? (
            <button onClick={(e) => { e.stopPropagation(); onToggleExpand(node.span.spanId); }} style={{ background: 'none', border: 'none', color: 'white', marginRight: 4, cursor: 'pointer' }}>
              {expanded ? '▼' : '▶'}
            </button>
          ) : <span style={{ width: 18, display: 'inline-block' }}></span>}
          <span style={{ 
            backgroundColor: getColor(node.span.serviceName), 
            color: '#fff', 
            padding: '2px 4px', 
            borderRadius: 4, 
            fontSize: '0.75rem',
            marginRight: 8
          }}>{node.span.serviceName}</span>
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{node.span.name}</span>
        </div>
        
        <div style={{ flex: 1, position: 'relative', borderLeft: '1px solid #444' }}>
          <div style={{
            position: 'absolute',
            left: `${leftPercent}%`,
            width: `${Math.max(widthPercent, 0.5)}%`,
            height: '100%',
            backgroundColor: isError ? '#ff4757' : getColor(node.span.serviceName),
            opacity: 0.8,
            borderRadius: 2
          }} title={`${node.span.durationMs}ms`} />
        </div>
      </div>
      
      {expanded && node.children.length > 0 && (
        <Waterfall 
          nodes={node.children} 
          totalTraceTimeMs={totalTraceTimeMs} 
          traceStartMs={traceStartMs} 
          depth={depth + 1}
          selectedSpanId={selectedSpanId}
          onSelect={onSelect}
          retainedSpanIds={retainedSpanIds}
          expandedState={expandedState}
          onToggleExpand={onToggleExpand}
        />
      )}
    </>
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
