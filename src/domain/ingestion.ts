import { Span, LogEvent, SpanStatusCode, Trace } from './model';

export interface Dataset {
  traces: Trace[];
}

export interface IngestionResult {
  dataset: Dataset;
  issues: string[];
}

export function parseJson(content: string): IngestionResult {
  try {
    const raw = JSON.parse(content);
    return normalize(Array.isArray(raw) ? raw : [raw]);
  } catch (e: any) {
    return { dataset: { traces: [] }, issues: [`JSON parse error: ${e.message}`] };
  }
}

export function parseNdjson(content: string): IngestionResult {
  const lines = content.split('\n');
  const records: any[] = [];
  const issues: string[] = [];

  lines.forEach((line, i) => {
    if (!line.trim()) return;
    try {
      records.push(JSON.parse(line));
    } catch (e: any) {
      issues.push(`Line ${i + 1}: ${e.message}`);
    }
  });

  try {
    const normalized = normalize(records);
    return {
      dataset: normalized.dataset,
      issues: [...issues, ...normalized.issues],
    };
  } catch (e: any) {
    issues.push(`Normalization error: ${e.message}`);
    return { dataset: { traces: [] }, issues };
  }
}

function parseAttributes(rawAttrs: any): Record<string, any> {
  if (Array.isArray(rawAttrs)) {
    return rawAttrs.reduce((acc, attr) => {
      let val = attr.value?.stringValue ?? attr.value?.boolValue ?? attr.value?.doubleValue ?? attr.value;
      if (attr.value?.intValue !== undefined) val = Number(attr.value.intValue);
      acc[attr.key] = val;
      return acc;
    }, {});
  }
  return rawAttrs || {};
}

function safeParseNanos(val: any, fallback: number): number {
  if (!val) return fallback;
  try {
    return Number(BigInt(val)) / 1000000;
  } catch {
    return fallback;
  }
}

function normalizeSeverity(severityNumber?: number, severityText?: string): 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' {
  if (severityNumber !== undefined) {
    if (severityNumber >= 17) return 'ERROR';
    if (severityNumber >= 13) return 'WARN';
    if (severityNumber >= 9) return 'INFO';
    if (severityNumber >= 1) return 'DEBUG';
  }
  const t = (severityText || '').toUpperCase();
  if (t === 'ERROR' || t === 'FATAL' || t === 'CRITICAL') return 'ERROR';
  if (t === 'WARN' || t === 'WARNING') return 'WARN';
  if (t === 'DEBUG' || t === 'TRACE') return 'DEBUG';
  return 'INFO';
}

export function normalize(records: any[]): IngestionResult {
  const spansByTrace = new Map<string, Span[]>();
  const logsByTrace = new Map<string, LogEvent[]>();
  const issues: string[] = [];
  const seenSpans = new Set<string>();

  function addSpan(span: Span) {
    if (!spansByTrace.has(span.traceId)) spansByTrace.set(span.traceId, []);
    spansByTrace.get(span.traceId)!.push(span);
  }

  function addLog(log: LogEvent) {
    const tId = log.traceId || 'unknown';
    if (!logsByTrace.has(tId)) logsByTrace.set(tId, []);
    logsByTrace.get(tId)!.push(log);
  }

  function processSpan(raw: any, resourceAttrs: any = {}, scopeAttrs: any = {}) {
    const traceId = String(raw.traceId || raw.trace_id || '');
    const spanId = String(raw.spanId || raw.span_id || '');
    if (!traceId || !spanId) {
      issues.push(`Record missing traceId/spanId`);
      return;
    }

    const key = `${traceId}:${spanId}`;
    if (seenSpans.has(key)) {
      issues.push(`Duplicate span ${key}`);
      return;
    }
    seenSpans.add(key);

    const parsedRawAttrs = parseAttributes(raw.attributes);
    const attributes = { ...resourceAttrs, ...scopeAttrs, ...parsedRawAttrs };
    const serviceName = String(raw.serviceName || raw.service_name || attributes['service.name'] || 'unknown-service');

    let startTime = Number(raw.startTime || 0);
    let endTime = Number(raw.endTime || 0);
    
    if (raw.startTimeUnixNano) startTime = safeParseNanos(raw.startTimeUnixNano, startTime);
    if (raw.endTimeUnixNano) endTime = safeParseNanos(raw.endTimeUnixNano, endTime);

    if (endTime < startTime) {
      issues.push(`Span ${spanId} end time precedes start time`);
      return;
    }

    let statusCode: SpanStatusCode = 'UNSET';
    const c = raw.status?.code;
    if (c === 2 || c === 'ERROR' || c === 'STATUS_CODE_ERROR') statusCode = 'ERROR';
    else if (c === 1 || c === 'OK' || c === 'STATUS_CODE_OK') statusCode = 'OK';

    addSpan({
      traceId,
      spanId,
      parentSpanId: raw.parentSpanId || raw.parent_span_id,
      serviceName,
      name: String(raw.name || 'unknown'),
      startTime,
      endTime,
      durationMs: Math.max(0, endTime - startTime),
      status: {
        code: statusCode,
        message: raw.status?.message
      },
      attributes,
      raw
    });
  }

  function processLog(raw: any, resourceAttrs: any = {}, scopeAttrs: any = {}) {
    const id = String(raw.id || Math.random().toString(36).slice(2));
    const parsedRawAttrs = parseAttributes(raw.attributes);
    const attributes = { ...resourceAttrs, ...scopeAttrs, ...parsedRawAttrs };
    
    let timestamp = Number(raw.timestamp || 0);
    if (raw.timeUnixNano) timestamp = safeParseNanos(raw.timeUnixNano, timestamp);

    addLog({
      id,
      traceId: raw.traceId || raw.trace_id,
      spanId: raw.spanId || raw.span_id,
      timestamp,
      severity: normalizeSeverity(raw.severityNumber, raw.severityText || raw.severity),
      message: String(raw.body?.stringValue || raw.body || raw.message || ''),
      attributes,
      stackTrace: String(attributes['exception.stacktrace'] || attributes['exception.message'] || ''),
      raw
    });
  }

  for (const record of records) {
    if (record.resourceSpans) {
      for (const rs of record.resourceSpans) {
        const resourceAttrs = parseAttributes(rs.resource?.attributes);
        for (const ss of rs.scopeSpans || []) {
          const scopeAttrs = parseAttributes(ss.scope?.attributes);
          for (const span of ss.spans || []) {
            processSpan(span, resourceAttrs, scopeAttrs);
          }
        }
      }
    } else if (record.resourceLogs) {
      for (const rl of record.resourceLogs) {
        const resourceAttrs = parseAttributes(rl.resource?.attributes);
        for (const sl of rl.scopeLogs || []) {
          const scopeAttrs = parseAttributes(sl.scope?.attributes);
          for (const log of sl.logRecords || []) {
            processLog(log, resourceAttrs, scopeAttrs);
          }
        }
      }
    } else if (record.spanId && record.traceId) {
      if (record.startTime !== undefined || record.name !== undefined || record.durationMs !== undefined) processSpan(record);
      else processLog(record);
    } else {
      issues.push(`Unknown record format`);
    }
  }

  const traces: Trace[] = [];
  const allTraceIds = new Set([...spansByTrace.keys(), ...logsByTrace.keys()]);
  for (const traceId of allTraceIds) {
    const spans = spansByTrace.get(traceId) || [];
    const logs = logsByTrace.get(traceId) || [];
    let startTime = 0;
    let endTime = 0;
    if (spans.length > 0) {
      startTime = Math.min(...spans.map(s => s.startTime));
      endTime = Math.max(...spans.map(s => s.endTime));
    }
    traces.push({
      traceId,
      spans,
      logs,
      startTime,
      endTime,
      durationMs: Math.max(0, endTime - startTime)
    });
  }
  
  // Sort traces by error count, then duration
  traces.sort((a, b) => {
    const aErrs = a.spans.filter(s => s.status.code === 'ERROR').length;
    const bErrs = b.spans.filter(s => s.status.code === 'ERROR').length;
    if (aErrs !== bErrs) return bErrs - aErrs;
    return b.durationMs - a.durationMs;
  });

  return { dataset: { traces }, issues };
}
