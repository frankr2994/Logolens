import { Trace } from '../domain/model';
import { compareTraces } from '../domain/comparison';

interface TraceDiffProps {
  traceA: Trace;
  traceB: Trace;
}

export function TraceDiff({ traceA, traceB }: TraceDiffProps) {
  const diff = compareTraces(traceA, traceB);

  const formatDelta = (val: number, isPercent: boolean = false) => {
    const sign = val > 0 ? '+' : '';
    const formatted = isPercent ? (val * 100).toFixed(1) + '%' : val.toFixed(1);
    return `${sign}${formatted}`;
  };

  const getDeltaColor = (val: number, invertGoodBad: boolean = false) => {
    if (Math.abs(val) < 0.001) return '#888'; // neutral
    const isGood = invertGoodBad ? val > 0 : val < 0;
    return isGood ? '#7bed9f' : '#ff4757';
  };

  return (
    <div style={{ padding: 24, backgroundColor: '#1a1a24', color: '#eee', height: '100%', overflowY: 'auto' }}>
      <h3 style={{ marginTop: 0, borderBottom: '1px solid #333', paddingBottom: 8 }}>Trace Comparison</h3>
      <div style={{ display: 'flex', gap: 24, marginBottom: 24 }}>
        <div style={{ flex: 1, backgroundColor: '#2a2a35', padding: 16, borderRadius: 8 }}>
          <h4 style={{ margin: '0 0 12px 0', color: '#aaa' }}>Base: {traceA.traceId.substring(0, 8)}...</h4>
          <div>Duration: {traceA.durationMs.toFixed(1)}ms</div>
          <div>Spans: {traceA.spans.length}</div>
        </div>
        <div style={{ flex: 1, backgroundColor: '#2a2a35', padding: 16, borderRadius: 8 }}>
          <h4 style={{ margin: '0 0 12px 0', color: '#aaa' }}>Compare: {traceB.traceId.substring(0, 8)}...</h4>
          <div>Duration: {traceB.durationMs.toFixed(1)}ms</div>
          <div>Spans: {traceB.spans.length}</div>
        </div>
      </div>

      <h4 style={{ borderBottom: '1px solid #333', paddingBottom: 8 }}>Metrics Delta</h4>
      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        <DeltaMetric 
          label="Duration" 
          value={formatDelta(diff.metricsDiff.durationDeltaMs) + 'ms'} 
          color={getDeltaColor(diff.metricsDiff.durationDeltaMs)} 
        />
        <DeltaMetric 
          label="Span Count" 
          value={formatDelta(diff.metricsDiff.spanCountDelta)} 
          color={getDeltaColor(diff.metricsDiff.spanCountDelta, true)} 
        />
        <DeltaMetric 
          label="Error Rate" 
          value={formatDelta(diff.metricsDiff.errorRateDelta, true)} 
          color={getDeltaColor(diff.metricsDiff.errorRateDelta)} 
        />
      </div>

      <h4 style={{ borderBottom: '1px solid #333', paddingBottom: 8 }}>Structural Changes</h4>
      {diff.missingServicesInB.length === 0 && diff.newServicesInB.length === 0 ? (
        <div style={{ color: '#888' }}>No changes in service topology.</div>
      ) : (
        <div style={{ display: 'flex', gap: 24 }}>
          {diff.missingServicesInB.length > 0 && (
            <div style={{ flex: 1 }}>
              <div style={{ color: '#ff4757', fontWeight: 'bold', marginBottom: 8 }}>Missing Services (in Compare)</div>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {diff.missingServicesInB.map(s => <li key={s}>{s}</li>)}
              </ul>
            </div>
          )}
          {diff.newServicesInB.length > 0 && (
            <div style={{ flex: 1 }}>
              <div style={{ color: '#7bed9f', fontWeight: 'bold', marginBottom: 8 }}>New Services (in Compare)</div>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {diff.newServicesInB.map(s => <li key={s}>{s}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DeltaMetric({ label, value, color }: { label: string, value: string, color: string }) {
  return (
    <div style={{ padding: '12px 16px', backgroundColor: '#2a2a35', borderRadius: 8, flex: 1, textAlign: 'center' }}>
      <div style={{ fontSize: '0.85rem', color: '#aaa', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color }}>{value}</div>
    </div>
  );
}
