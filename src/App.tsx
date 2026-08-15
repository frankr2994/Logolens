import React, { useState, useMemo } from 'react';
import { FilterState, filterSpans, getRetainedSpanIds } from './domain/filtering';
import { calculateMetrics } from './domain/metrics';
import { buildHierarchy } from './domain/hierarchy';
import { parseJson, parseNdjson, Dataset } from './domain/ingestion';
import { checkoutSample } from './domain/samples/checkout';
import { Waterfall } from './components/Waterfall';

export default function App() {
  const [dataset, setDataset] = useState<Dataset>({ traces: [] });
  const [selectedTraceId, setSelectedTraceId] = useState<string>('');
  
  const [filters, setFilters] = useState<FilterState>({
    services: [], httpStatusCodes: [], severities: [], minDurationMs: null, searchQuery: ''
  });
  const [selectedSpanId, setSelectedSpanId] = useState<string | undefined>();
  const [expandedState, setExpandedState] = useState<Record<string, boolean>>({});
  
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    let res = parseJson(text);
    if (res.issues.length > 0 && text.includes('\n')) {
      const resNd = parseNdjson(text);
      if (resNd.dataset.traces.length > res.dataset.traces.length) {
        res = resNd;
      }
    }
    setDataset(res.dataset);
    if (res.dataset.traces.length > 0) {
      setSelectedTraceId(res.dataset.traces[0].traceId);
    }
  };
  
  const loadSample = () => {
    setDataset(checkoutSample);
    if (checkoutSample.traces.length > 0) setSelectedTraceId(checkoutSample.traces[0].traceId);
  };
  
  const trace = useMemo(() => dataset.traces.find(t => t.traceId === selectedTraceId) || dataset.traces[0], [dataset, selectedTraceId]);
  
  const { roots, orphans } = useMemo(() => trace ? buildHierarchy(trace.spans) : { roots: [], orphans: [], issues: [] }, [trace]);
  const metrics = useMemo(() => trace ? calculateMetrics(trace.spans, trace.logs) : { totalTraceTimeMs: 0, spanCount: 0, errorRate: 0, bottleneckSpan: null }, [trace]);
  
  const retainedSpanIds = useMemo(() => {
    if (!trace) return new Set<string>();
    const matched = filterSpans(trace.spans, trace.logs, filters);
    return getRetainedSpanIds(trace.spans, matched);
  }, [trace, filters]);
  
  const selectedSpan = useMemo(() => trace?.spans.find(s => s.spanId === selectedSpanId), [trace, selectedSpanId]);

  const toggleExpand = (spanId: string) => {
    setExpandedState(prev => ({ ...prev, [spanId]: prev[spanId] === false ? true : false }));
  };
  
  const jumpToError = () => {
    if (!trace) return;
    const errSpan = trace.spans.find(s => s.status.code === 'ERROR' || (s.attributes['http.response.status_code'] as number) >= 500);
    if (errSpan) {
      let curr = errSpan.parentSpanId;
      const newExpanded = { ...expandedState };
      while (curr) {
        newExpanded[curr] = true;
        const parent = trace.spans.find(s => s.spanId === curr);
        curr = parent?.parentSpanId;
      }
      setExpandedState(newExpanded);
      setSelectedSpanId(errSpan.spanId);
      // Ensure we clear filters to see it
      setFilters({ services: [], httpStatusCodes: [], severities: [], minDurationMs: null, searchQuery: '' });
    }
  };

  const allServices = Array.from(new Set(trace?.spans.map(s => s.serviceName) || []));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100%', overflow: 'hidden' }}>
      <header style={{ padding: 16, backgroundColor: '#1a1a24', borderBottom: '1px solid #333' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>LogLens</h2>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <input type="file" onChange={handleFileUpload} />
            <button onClick={loadSample}>Load Sample</button>
            {dataset.traces.length > 1 && (
              <select value={selectedTraceId} onChange={e => setSelectedTraceId(e.target.value)}>
                {dataset.traces.map(t => (
                  <option key={t.traceId} value={t.traceId}>{t.traceId} ({t.spans.length} spans)</option>
                ))}
              </select>
            )}
            <button onClick={jumpToError} style={{ color: '#ff6b6b' }}>Jump to Error</button>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="text" placeholder="Search..." value={filters.searchQuery} onChange={e => setFilters({...filters, searchQuery: e.target.value})} style={{ padding: 4 }} />
          
          <select onChange={e => {
            const opts = Array.from(e.target.selectedOptions, option => option.value);
            setFilters({...filters, services: opts.includes('') ? [] : opts});
          }} multiple style={{ height: 40 }}>
            <option value="">All Services</option>
            {allServices.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <select onChange={e => {
            const opts = Array.from(e.target.selectedOptions, option => option.value);
            setFilters({...filters, httpStatusCodes: opts.includes('') ? [] : opts});
          }} multiple style={{ height: 40 }}>
            <option value="">All HTTP Statuses</option>
            {Array.from(new Set(trace?.spans.map(s => String(s.attributes['http.response.status_code'] ?? s.attributes['http.status_code'] ?? '')).filter(Boolean))).map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <input type="number" placeholder="Min latency ms" value={filters.minDurationMs || ''} onChange={e => setFilters({...filters, minDurationMs: e.target.value ? Number(e.target.value) : null})} style={{ width: 120, padding: 4 }} />
          
          <select onChange={e => {
            const opts = Array.from(e.target.selectedOptions, option => option.value);
            setFilters({...filters, severities: opts.includes('') ? [] : opts});
          }} multiple style={{ height: 40 }}>
            <option value="">All Severities</option>
            <option value="ERROR">ERROR</option>
            <option value="WARN">WARN</option>
            <option value="INFO">INFO</option>
            <option value="DEBUG">DEBUG</option>
          </select>
        </div>
        
        {trace && (
          <div style={{ display: 'flex', gap: 16, marginTop: 16, fontSize: '0.9rem' }}>
            <div>Trace Time: {metrics.totalTraceTimeMs.toFixed(2)}ms</div>
            <div>Spans: {metrics.spanCount}</div>
            <div>Error Rate: {(metrics.errorRate * 100).toFixed(1)}%</div>
            <div>Bottleneck: {metrics.bottleneckSpan?.name ?? 'None'}</div>
          </div>
        )}
      </header>
      
      <main style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          {trace && (roots.length > 0 || orphans.length > 0) ? (
            <Waterfall 
              nodes={[...roots, ...orphans]}
              totalTraceTimeMs={metrics.totalTraceTimeMs}
              traceStartMs={trace.startTime}
              selectedSpanId={selectedSpanId}
              onSelect={setSelectedSpanId}
              retainedSpanIds={retainedSpanIds}
              expandedState={expandedState}
              onToggleExpand={toggleExpand}
            />
          ) : <div>No trace data</div>}
        </div>
        
        {selectedSpan && (
          <div style={{ width: 400, backgroundColor: '#1e1e2d', borderLeft: '1px solid #333', padding: 16, overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <h3>Inspector</h3>
              <button onClick={() => setSelectedSpanId(undefined)}>Close</button>
            </div>
            
            <h4>Span Details</h4>
            <pre style={{ fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}>
              {JSON.stringify(selectedSpan, null, 2)}
            </pre>

            <h4>Associated Logs</h4>
            {(() => {
              const spanLogs = trace?.logs.filter(l => l.spanId === selectedSpan.spanId) || [];
              if (spanLogs.length === 0) return <div style={{ fontSize: '0.8rem', color: '#888' }}>No logs associated with this span.</div>;
              return spanLogs.map(log => (
                <div key={log.id} style={{ marginBottom: 16, backgroundColor: '#2a2a3a', padding: 8, borderRadius: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ color: log.severity === 'ERROR' ? '#ff6b6b' : log.severity === 'WARN' ? '#feca57' : '#48dbfb' }}>{log.severity}</span>
                    <span style={{ color: '#888' }}>{log.timestamp.toFixed(2)}ms</span>
                  </div>
                  <div style={{ fontSize: '0.9rem', marginTop: 4 }}>{log.message}</div>
                  {log.stackTrace && (
                    <pre style={{ fontSize: '0.75rem', color: '#ff9f43', marginTop: 8, overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
                      {log.stackTrace}
                    </pre>
                  )}
                  <pre style={{ fontSize: '0.75rem', marginTop: 8, color: '#aaa', whiteSpace: 'pre-wrap' }}>
                    {JSON.stringify(log.attributes, null, 2)}
                  </pre>
                </div>
              ));
            })()}
          </div>
        )}
      </main>
    </div>
  );
}
