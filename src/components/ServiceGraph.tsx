import { useMemo } from 'react';
import { buildTopology } from '../domain/topology';
import { Trace } from '../domain/model';

interface ServiceGraphProps {
  trace: Trace;
}

export function ServiceGraph({ trace }: ServiceGraphProps) {
  const { nodes, edges } = useMemo(() => buildTopology(trace), [trace]);

  // Very simple circular layout
  const width = 600;
  const height = 400;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(cx, cy) - 60;

  const positions = useMemo(() => {
    const pos = new Map<string, { x: number, y: number }>();
    nodes.forEach((n, i) => {
      const angle = (i / nodes.length) * 2 * Math.PI - Math.PI / 2;
      pos.set(n.id, {
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle)
      });
    });
    return pos;
  }, [nodes, cx, cy, radius]);

  if (nodes.length === 0) {
    return <div style={{ padding: 16, color: '#888' }}>No service data available.</div>;
  }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyItems: 'center', backgroundColor: '#1a1a24' }}>
      <svg width={width} height={height} style={{ margin: '0 auto', display: 'block' }}>
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="24" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#888" />
          </marker>
          <marker id="arrow-error" viewBox="0 0 10 10" refX="24" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#ff4757" />
          </marker>
        </defs>

        {edges.map((e, i) => {
          const s = positions.get(e.source)!;
          const t = positions.get(e.target)!;
          const isError = e.errorCount > 0;
          return (
            <line
              key={i}
              x1={s.x} y1={s.y} x2={t.x} y2={t.y}
              stroke={isError ? '#ff4757' : '#888'}
              strokeWidth={Math.max(1, Math.min(5, e.requestCount))}
              markerEnd={`url(#${isError ? 'arrow-error' : 'arrow'})`}
              opacity={0.6}
            />
          );
        })}

        {nodes.map(n => {
          const p = positions.get(n.id)!;
          const hasError = n.errorCount > 0;
          const avgLatency = n.requestCount > 0 ? (n.totalDurationMs / n.requestCount).toFixed(1) : 0;
          return (
            <g key={n.id} transform={`translate(${p.x}, ${p.y})`}>
              <circle r={20} fill={hasError ? '#ff4757' : '#1e90ff'} opacity={0.8} />
              <text y={-25} textAnchor="middle" fill="#fff" fontSize="12" fontWeight="bold">
                {n.id}
              </text>
              <text y={4} textAnchor="middle" fill="#fff" fontSize="10">
                {n.requestCount} req
              </text>
              <text y={35} textAnchor="middle" fill="#aaa" fontSize="10">
                {avgLatency}ms avg
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
