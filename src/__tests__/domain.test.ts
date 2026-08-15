import { describe, it, expect } from 'vitest';
import { buildHierarchy } from '../domain/hierarchy';
import { filterSpans } from '../domain/filtering';
import { calculateMetrics } from '../domain/metrics';
import { parseJson, parseNdjson } from '../domain/ingestion';
import { calculateExclusiveTime } from '../domain/timing';

describe('LogLens Domain', () => {
  it('buildHierarchy should assemble trees and identify orphans', () => {
    const spans: any = [
      { spanId: '1', startTime: 10, durationMs: 10 },
      { spanId: '2', parentSpanId: '1', startTime: 12, durationMs: 5 },
      { spanId: '3', parentSpanId: '99', startTime: 5, durationMs: 2 }, // orphan
    ];
    const { roots, orphans } = buildHierarchy(spans);
    expect(roots.length).toBe(1);
    expect(roots[0].span.spanId).toBe('1');
    expect(roots[0].children.length).toBe(1);
    expect(roots[0].children[0].span.spanId).toBe('2');
    expect(orphans.length).toBe(1);
    expect(orphans[0].span.spanId).toBe('3');
  });

  it('buildHierarchy should break cycles', () => {
    const spans: any = [
      { spanId: '1', parentSpanId: '2', startTime: 10, durationMs: 10 },
      { spanId: '2', parentSpanId: '1', startTime: 12, durationMs: 5 }
    ];
    const { issues } = buildHierarchy(spans);
    expect(issues.some(i => i.includes('Cycle detected'))).toBe(true);
  });

  it('calculateMetrics computes correct error rate and trace time', () => {
    const spans: any = [
      { spanId: '1', startTime: 10, endTime: 20, durationMs: 10, status: { code: 'ERROR' }, attributes: {} },
      { spanId: '2', startTime: 12, endTime: 15, durationMs: 3, status: { code: 'OK' }, attributes: {} },
    ];
    const metrics = calculateMetrics(spans, []);
    expect(metrics.totalTraceTimeMs).toBe(10);
    expect(metrics.spanCount).toBe(2);
    expect(metrics.errorRate).toBe(0.5);
  });
  
  it('calculateExclusiveTime handles overlapping children', () => {
    const parent: any = { durationMs: 100, startTime: 10, endTime: 110 };
    const children: any[] = [
      { startTime: 20, endTime: 50 }, // 30ms
      { startTime: 40, endTime: 60 }, // overlapping -> effectively 20..60 (40ms)
      { startTime: 90, endTime: 120 } // outside parent -> effectively 90..110 (20ms)
    ];
    // Total children = 40 + 20 = 60. Parent exclusive = 100 - 60 = 40.
    const exclusive = calculateExclusiveTime(parent, children);
    expect(exclusive).toBe(40);
  });

  it('filterSpans applies filters correctly', () => {
    const spans: any = [
      { spanId: '1', serviceName: 'A', durationMs: 100, attributes: {}, name: 'req1' },
      { spanId: '2', serviceName: 'B', durationMs: 50, attributes: {}, name: 'req2' }
    ];
    
    const res1 = filterSpans(spans, [], { services: ['A'], httpStatusCodes: [], severities: [], minDurationMs: null, searchQuery: '' });
    expect(res1.has('1')).toBe(true);
    expect(res1.has('2')).toBe(false);
    
    const res2 = filterSpans(spans, [], { services: [], httpStatusCodes: [], severities: [], minDurationMs: 80, searchQuery: '' });
    expect(res2.has('1')).toBe(true);
    expect(res2.has('2')).toBe(false);
  });

  it('parseJson handles canonical JSON with serviceName', () => {
    const json = JSON.stringify([{
      traceId: 't1', spanId: 's1', name: 'req', serviceName: 'frontend'
    }]);
    const res = parseJson(json);
    expect(res.dataset.traces[0].spans[0].serviceName).toBe('frontend');
  });

  it('parseNdjson handles malformed lines cleanly', () => {
    const ndjson = '{"traceId": "t1", "spanId": "s1", "name": "req", "timeUnixNano": "invalid"}\ninvalid_json\n{"traceId": "t1", "spanId": "s2", "name": "req2"}';
    const res = parseNdjson(ndjson);
    expect(res.dataset.traces[0].spans.length).toBe(2);
    expect(res.issues.some(i => i.includes('Line 2'))).toBe(true);
  });
  
  it('parseJson handles OTLP array attributes', () => {
    const otlp = JSON.stringify({
      resourceSpans: [{
        resource: { attributes: [{ key: 'service.name', value: { stringValue: 'backend' } }] },
        scopeSpans: [{
          spans: [{ traceId: 't1', spanId: 's1' }]
        }]
      }]
    });
    const res = parseJson(otlp);
    expect(res.dataset.traces[0].spans[0].serviceName).toBe('backend');
  });

  it('parseNdjson handles malformed logs and normalizes severity properly', () => {
    const ndjson = '{"traceId": "t1", "spanId": "s1", "timeUnixNano": "1000000", "severityNumber": 17, "attributes": {"exception.stacktrace": "Error at line 1"}}\n' +
                   '{"traceId": "t1", "spanId": "s2", "severityText": "WARNING"}';
    const res = parseNdjson(ndjson);
    expect(res.dataset.traces[0].logs.length).toBe(2);
    expect(res.dataset.traces[0].logs[0].severity).toBe('ERROR');
    expect(res.dataset.traces[0].logs[0].stackTrace).toBe('Error at line 1');
    expect(res.dataset.traces[0].logs[1].severity).toBe('WARN');
  });

  it('calculates float timestamps properly and handles overlapping spans crossing ms boundaries', () => {
    const ndjson = '{"traceId": "t1", "spanId": "s1", "name": "s1", "startTimeUnixNano": "1500500", "endTimeUnixNano": "1800500"}\n' +
                   '{"traceId": "t1", "spanId": "s2", "name": "s2", "startTimeUnixNano": "1200000", "endTimeUnixNano": "1600000"}';
    const res = parseNdjson(ndjson);
    expect(res.dataset.traces[0].spans[0].durationMs).toBeCloseTo(0.3); // 1.8005 - 1.5005
  });

  it('properly converts intValue to numbers for metrics processing', () => {
    const otlp = JSON.stringify({
      resourceSpans: [{
        scopeSpans: [{
          spans: [{ traceId: 't1', spanId: 's1', attributes: [{ key: 'http.response.status_code', value: { intValue: "500" } }] }]
        }]
      }]
    });
    const res = parseJson(otlp);
    expect(res.dataset.traces[0].spans[0].attributes['http.response.status_code']).toBe(500);
    const metrics = calculateMetrics(res.dataset.traces[0].spans, []);
    expect(metrics.errorRate).toBe(1); // 1 out of 1 is error
  });

  it('supports HTTP filtering accurately', () => {
    const spans: any = [
      { spanId: '1', serviceName: 'A', durationMs: 100, attributes: { 'http.status_code': 500 }, name: 'req1' },
      { spanId: '2', serviceName: 'B', durationMs: 50, attributes: { 'http.response.status_code': 200 }, name: 'req2' }
    ];
    const res = filterSpans(spans, [], { services: [], httpStatusCodes: ['500'], severities: [], minDurationMs: null, searchQuery: '' });
    expect(res.has('1')).toBe(true);
    expect(res.has('2')).toBe(false);
  });
});
