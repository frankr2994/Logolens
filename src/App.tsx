import React, { useState, useMemo } from 'react';
import { FilterState, filterSpans, getRetainedSpanIds } from './domain/filtering';
import { calculateMetrics } from './domain/metrics';
import { buildHierarchy } from './domain/hierarchy';
import { parseJson, parseNdjson, Dataset } from './domain/ingestion';
import { checkoutSample } from './domain/samples/checkout';
import { Waterfall } from './components/Waterfall';
import { FlameGraph } from './components/FlameGraph';
import { ServiceGraph } from './components/ServiceGraph';
import { TraceDiff } from './components/TraceDiff';
import { LogStream } from './components/LogStream';

export default function App() {
  const [dataset, setDataset] = useState<Dataset>({ traces: [] });
  const [selectedTraceId, setSelectedTraceId] = useState<string>('');
  
  const [filters, setFilters] = useState<FilterState>({
    services: [], httpStatusCodes: [], severities: [], minDurationMs: null, searchQuery: ''
  });
  const [selectedSpanId, setSelectedSpanId] = useState<string | undefined>();
  const [expandedState, setExpandedState] = useState<Record<string, boolean>>({});
  const [importSummary, setImportSummary] = useState<{ acceptedSpans: number, acceptedLogs: number, issues: string[] } | null>(null);
  
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
    
    let acceptedSpans = 0;
    let acceptedLogs = 0;
    res.dataset.traces.forEach(t => {
      acceptedSpans += t.spans.length;
      acceptedLogs += t.logs.length;
    });

    setImportSummary({ acceptedSpans, acceptedLogs, issues: res.issues });

    setDataset(res.dataset);
    if (res.dataset.traces.length > 0) {
      setSelectedTraceId(res.dataset.traces[0].traceId);
    } else {
      setSelectedTraceId('');
    }
    setSelectedSpanId(undefined);
    setExpandedState({});
    setFilters({ services: [], httpStatusCodes: [], severities: [], minDurationMs: null, searchQuery: '' });
  };
  
  const loadSample = () => {
    setDataset(checkoutSample);
    setImportSummary(null);
    if (checkoutSample.traces.length > 0) {
      setSelectedTraceId(checkoutSample.traces[0].traceId);
      setSelectedSpanId(undefined);
      setExpandedState({});
      setFilters({ services: [], httpStatusCodes: [], severities: [], minDurationMs: null, searchQuery: '' });
    }
  };
  
  const trace = useMemo(() => dataset.traces.find(t => t.traceId === selectedTraceId) || dataset.traces[0], [dataset, selectedTraceId]);
  
  const { roots, orphans, issues: hierarchyIssues } = useMemo(() => trace ? buildHierarchy(trace) : { roots: [], orphans: [], issues: [] }, [trace]);
  const metrics = useMemo(() => trace ? calculateMetrics(trace) : { totalTraceTimeMs: 0, spanCount: 0, errorRate: 0, bottleneckSpan: null }, [trace]);
  
  const retainedSpanIds = useMemo(() => {
    if (!trace) return new Set<string>();
    const matched = filterSpans(trace, filters);
    return getRetainedSpanIds(trace, matched);
  }, [trace, filters]);
  
  const selectedSpan = useMemo(() => trace?.spans.find(s => s.spanId === selectedSpanId), [trace, selectedSpanId]);

  const toggleExpand = (spanId: string) => {
    setExpandedState(prev => ({ ...prev, [spanId]: prev[spanId] === false ? true : false }));
  };
  
  const jumpToError = () => {
    if (!trace) return;
    const errSpan = trace.spans.find(s => s.status.code === 'ERROR' || (s.attributes['http.response.status_code'] as number) >= 500 || (s.attributes['http.status_code'] as number) >= 500);
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
      setFilters({ services: [], httpStatusCodes: [], severities: [], minDurationMs: null, searchQuery: '' });
    }
  };

  const [viewMode, setViewMode] = useState<'waterfall' | 'flame' | 'topology' | 'compare'>('waterfall');
  const [compareTraceId, setCompareTraceId] = useState<string>('');

  const updateFilters = (newFilters: FilterState) => {
    setFilters(newFilters);
    setExpandedState({});
  };

  const allServices = Array.from(new Set(trace?.spans.map(s => s.serviceName) || []));
  const compareTrace = useMemo(() => dataset.traces.find(t => t.traceId === compareTraceId), [dataset, compareTraceId]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100%', overflow: 'hidden' }}>
      <header style={{ padding: 16, backgroundColor: '#1a1a24', borderBottom: '1px solid #333' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>LogLens</h2>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <input type="file" onChange={handleFileUpload} />
            <button onClick={loadSample}>Load Sample</button>
            {dataset.traces.length > 1 && (
              <select value={selectedTraceId} onChange={e => {
                setSelectedTraceId(e.target.value);
                setSelectedSpanId(undefined);
              }}>
                {dataset.traces.map(t => (
                  <option key={t.traceId} value={t.traceId}>{t.traceId} ({t.spans.length} spans)</option>
                ))}
              </select>
            )}
            <button onClick={jumpToError} style={{ color: '#ff6b6b' }}>Jump to Error</button>
            
            <div style={{ display: 'flex', border: '1px solid #444', borderRadius: 4, overflow: 'hidden' }}>
              {(['waterfall', 'flame', 'topology', 'compare'] as const).map(mode => (
                <button 
                  key={mode} 
                  onClick={() => setViewMode(mode)}
                  style={{
                    padding: '6px 12px',
                    border: 'none',
                    backgroundColor: viewMode === mode ? '#3a3a4a' : 'transparent',
                    color: viewMode === mode ? '#fff' : '#aaa',
                    cursor: 'pointer'
                  }}
                >
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="text" placeholder="Search..." value={filters.searchQuery} onChange={e => updateFilters({...filters, searchQuery: e.target.value})} style={{ padding: 4 }} />
          
          <select value={filters.services} onChange={e => {
            const opts = Array.from(e.target.selectedOptions, option => option.value);
            updateFilters({...filters, services: opts.includes('') ? [] : opts});
          }} multiple style={{ height: 40 }}>
            <option value="">All Services</option>
            {allServices.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <select value={filters.httpStatusCodes} onChange={e => {
            const opts = Array.from(e.target.selectedOptions, option => option.value);
            updateFilters({...filters, httpStatusCodes: opts.includes('') ? [] : opts});
          }} multiple style={{ height: 40 }}>
            <option value="">All HTTP Statuses</option>
            {Array.from(new Set(trace?.spans.map(s => String(s.attributes['http.response.status_code'] ?? s.attributes['http.status_code'] ?? '')).filter(Boolean))).map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <input type="number" placeholder="Min latency ms" value={filters.minDurationMs || ''} onChange={e => updateFilters({...filters, minDurationMs: e.target.value ? Number(e.target.value) : null})} style={{ width: 120, padding: 4 }} />
          
          <select value={filters.severities} onChange={e => {
            const opts = Array.from(e.target.selectedOptions, option => option.value);
            updateFilters({...filters, severities: opts.includes('') ? [] : opts});
          }} multiple style={{ height: 40 }}>
            <option value="">All Severities</option>
            <option value="ERROR">ERROR</option>
            <option value="WARN">WARN</option>
            <option value="INFO">INFO</option>
            <option value="DEBUG">DEBUG</option>
          </select>
        </div>
        
        {importSummary && (
          <div style={{ marginTop: 16, padding: 8, backgroundColor: '#2a2a3a', borderRadius: 4, fontSize: '0.85rem' }}>
            <div><strong>Import Summary:</strong> Accepted {importSummary.acceptedSpans} spans, {importSummary.acceptedLogs} logs.</div>
            {importSummary.issues.length > 0 && (
              <div style={{ color: '#feca57', marginTop: 4 }}>
                <strong>Warnings:</strong>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {importSummary.issues.slice(0, 5).map((i, idx) => <li key={idx}>{i}</li>)}
                  {importSummary.issues.length > 5 && <li>...and {importSummary.issues.length - 5} more issues</li>}
                </ul>
              </div>
            )}
          </div>
        )}

        {hierarchyIssues && hierarchyIssues.length > 0 && (
          <div style={{ marginTop: 8, padding: 8, backgroundColor: '#3a2a2a', borderRadius: 4, fontSize: '0.85rem', color: '#ff6b6b' }}>
            <strong>Hierarchy Issues:</strong> {hierarchyIssues.join(', ')}
          </div>
        )}

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
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
            {viewMode === 'waterfall' && trace && (roots.length > 0 || orphans.length > 0) ? (
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
            ) : viewMode === 'flame' && trace ? (
              <FlameGraph 
                nodes={[...roots, ...orphans]}
                totalTraceTimeMs={metrics.totalTraceTimeMs}
                traceStartMs={trace.startTime}
                selectedSpanId={selectedSpanId}
                onSelect={setSelectedSpanId}
                retainedSpanIds={retainedSpanIds}
              />
            ) : viewMode === 'topology' && trace ? (
              <ServiceGraph trace={trace} />
            ) : viewMode === 'compare' ? (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: 16, backgroundColor: '#2a2a3a' }}>
                  Select trace to compare against: 
                  <select value={compareTraceId} onChange={e => setCompareTraceId(e.target.value)} style={{ marginLeft: 8 }}>
                    <option value="">-- Select Trace --</option>
                    {dataset.traces.map(t => <option key={t.traceId} value={t.traceId}>{t.traceId}</option>)}
                  </select>
                </div>
                {trace && compareTrace ? (
                  <TraceDiff traceA={trace} traceB={compareTrace} />
                ) : (
                  <div style={{ padding: 16 }}>Please select a trace to compare.</div>
                )}
              </div>
            ) : <div>No trace data</div>}
          </div>
          
          <div style={{ height: '30%', minHeight: 150, borderTop: '2px solid #333' }}>
            {trace && <LogStream logs={trace.logs} trace={trace} selectedSpanId={selectedSpanId} />}
          </div>
        </div>
        
        {selectedSpan && (
          <div style={{ width: 400, backgroundColor: '#1e1e2d', borderLeft: '1px solid #333', padding: 16, overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <h3>Inspector</h3>
              <button onClick={() => setSelectedSpanId(undefined)}>Close</button>
            </div>
            
            <h4>Span Details</h4>
            <pre style={{ fontSize: '0.8rem', whiteSpace: 'pre-wrap', color: '#ccc' }}>
              {JSON.stringify(selectedSpan, null, 2)}
            </pre>
          </div>
        )}
      </main>
    </div>
  );
}
