import { LogEvent, Trace } from '../domain/model';

interface LogStreamProps {
  logs: LogEvent[];
  trace: Trace;
  selectedSpanId?: string;
}

export function LogStream({ logs, trace, selectedSpanId }: LogStreamProps) {
  const displayLogs = selectedSpanId ? logs.filter(l => l.spanId === selectedSpanId) : logs;
  
  if (displayLogs.length === 0) {
    return <div style={{ padding: 16, color: '#888' }}>No logs available for this scope.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', backgroundColor: '#1a1a24' }}>
      <div style={{ padding: '8px 16px', borderBottom: '1px solid #333', fontWeight: 'bold' }}>
        Log Stream ({displayLogs.length} events) {selectedSpanId && '- Filtered by selected span'}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {displayLogs.map((log, idx) => {
          const timeOffset = log.timestamp ? (log.timestamp - trace.startTime).toFixed(2) : '?';
          return (
            <div key={idx} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #333', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', gap: 12, marginBottom: 4 }}>
                <span style={{ color: getSeverityColor(log.severity), fontWeight: 'bold', width: 60 }}>{log.severity}</span>
                <span style={{ color: '#888' }}>+{timeOffset}ms</span>
                {log.spanId && !selectedSpanId && <span style={{ color: '#aaa' }}>Span: {log.spanId.substring(0, 8)}...</span>}
              </div>
              <div style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', color: '#ccc' }}>
                {log.message}
              </div>
              {log.stackTrace && (
                <div style={{ marginTop: 8, padding: 8, backgroundColor: '#2a2a35', borderRadius: 4, fontFamily: 'monospace', color: '#fca5a5', whiteSpace: 'pre-wrap', overflowX: 'auto' }}>
                  {log.stackTrace}
                </div>
              )}
              {Object.keys(log.attributes).length > 0 && (
                <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {Object.entries(log.attributes).map(([k, v]) => (
                    <span key={k} style={{ padding: '2px 6px', backgroundColor: '#333', borderRadius: 4, fontSize: '0.75rem', color: '#bbb' }}>
                      {k}: {String(v)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getSeverityColor(sev: string) {
  switch(sev.toUpperCase()) {
    case 'ERROR':
    case 'FATAL': return '#ff4757';
    case 'WARN': return '#ffa502';
    case 'INFO': return '#1e90ff';
    case 'DEBUG':
    case 'TRACE': return '#7bed9f';
    default: return '#ccc';
  }
}
