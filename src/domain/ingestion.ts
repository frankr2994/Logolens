import { Span, LogEvent, SpanStatusCode, Trace, AttributeValue } from './model';

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
  } catch (e) {
    const err = e as Error;
    return { dataset: { traces: [] }, issues: [`JSON parse error: ${err.message}`] };
  }
}

export function parseNdjson(content: string): IngestionResult {
  const lines = content.split('\n');
  const records: unknown[] = [];
  const issues: string[] = [];

  lines.forEach((line, i) => {
    if (!line.trim()) return;
    try {
      records.push(JSON.parse(line));
    } catch (e) {
      const err = e as Error;
      issues.push(`Line ${i + 1}: ${err.message}`);
    }
  });

  try {
    const normalized = normalize(records);
    return {
      dataset: normalized.dataset,
      issues: [...issues, ...normalized.issues],
    };
  } catch (e) {
    const err = e as Error;
    issues.push(`Normalization error: ${err.message}`);
    return { dataset: { traces: [] }, issues };
  }
}

interface RawAttrValue {
  stringValue?: string;
  boolValue?: boolean;
  doubleValue?: number;
  intValue?: number | string;
  arrayValue?: { values: RawAttrValue[] };
  kvlistValue?: { values: RawAttr[] };
  [key: string]: unknown;
}

interface RawAttr {
  key: string;
  value?: RawAttrValue | string | number | boolean;
}

function parseAttributes(rawAttrs: unknown): Record<string, AttributeValue> {
  if (Array.isArray(rawAttrs)) {
    return rawAttrs.reduce((acc: Record<string, AttributeValue>, attr: RawAttr) => {
      let val: unknown = undefined;
      
      if (typeof attr.value === 'object' && attr.value !== null) {
        const v = attr.value as RawAttrValue;
        val = v.stringValue ?? v.boolValue ?? v.doubleValue;
        if (val === undefined && v.intValue !== undefined) val = Number(v.intValue);
        
        if (v.arrayValue?.values) {
          val = v.arrayValue.values.map((av: RawAttrValue) => av?.stringValue ?? av?.boolValue ?? av?.doubleValue ?? (av?.intValue !== undefined ? Number(av.intValue) : av));
        }
        if (v.kvlistValue?.values) {
          val = parseAttributes(v.kvlistValue.values);
        }
        if (val === undefined) val = v; // fallback
      } else {
        val = attr.value;
      }
      
      acc[attr.key] = val as AttributeValue;
      return acc;
    }, {});
  }
  if (typeof rawAttrs === 'object' && rawAttrs !== null) {
    return rawAttrs as Record<string, AttributeValue>;
  }
  return {};
}

function safeParseNanos(val: unknown, fallback: number): number {
  if (!val) return fallback;
  try {
    return Number(BigInt(val as string | number | bigint)) / 1000000;
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

export function normalize(records: unknown[]): IngestionResult {
  const spansByTrace = new Map<string, Span[]>();
  const logsByTrace = new Map<string, LogEvent[]>();
  const issues: string[] = [];
  const seenSpans = new Set<string>();
  let logCounter = 0;

  function addSpan(span: Span) {
    if (!spansByTrace.has(span.traceId)) spansByTrace.set(span.traceId, []);
    spansByTrace.get(span.traceId)!.push(span);
  }

  function addLog(log: LogEvent) {
    const tId = log.traceId || 'unknown';
    if (!logsByTrace.has(tId)) logsByTrace.set(tId, []);
    logsByTrace.get(tId)!.push(log);
  }

  function processSpan(raw: Record<string, unknown>, resourceAttrs: Record<string, AttributeValue> = {}, scopeAttrs: Record<string, AttributeValue> = {}) {
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

    if (!endTime && raw.durationMs !== undefined) {
      endTime = startTime + Number(raw.durationMs);
    }

    if (endTime < startTime) {
      issues.push(`Span ${spanId} end time precedes start time`);
      return;
    }

    let statusCode: SpanStatusCode = 'UNSET';
    const statusObj = raw.status as Record<string, unknown> | undefined;
    const c = statusObj?.code;
    if (c === 2 || c === 'ERROR' || c === 'STATUS_CODE_ERROR') statusCode = 'ERROR';
    else if (c === 1 || c === 'OK' || c === 'STATUS_CODE_OK') statusCode = 'OK';

    addSpan({
      traceId,
      spanId,
      parentSpanId: (raw.parentSpanId || raw.parent_span_id) as string | undefined,
      serviceName,
      name: String(raw.name || 'unknown'),
      startTime,
      endTime,
      durationMs: Math.max(0, endTime - startTime),
      status: {
        code: statusCode,
        message: statusObj?.message as string | undefined
      },
      attributes,
      raw
    });
  }

  function processLog(raw: Record<string, unknown>, resourceAttrs: Record<string, AttributeValue> = {}, scopeAttrs: Record<string, AttributeValue> = {}) {
    logCounter++;
    const id = String(raw.id || `log-${logCounter}-${raw.traceId || raw.trace_id || 'notrace'}`);
    const parsedRawAttrs = parseAttributes(raw.attributes);
    const attributes = { ...resourceAttrs, ...scopeAttrs, ...parsedRawAttrs };
    
    let timestamp = Number(raw.timestamp || 0);
    if (raw.timeUnixNano) timestamp = safeParseNanos(raw.timeUnixNano, timestamp);

    let messageStr = '';
    const bodyObj = raw.body as Record<string, unknown> | undefined;
    const body = bodyObj?.stringValue ?? raw.body ?? raw.message;
    if (typeof body === 'object' && body !== null) {
      messageStr = JSON.stringify(body);
    } else {
      messageStr = String(body || '');
    }

    addLog({
      id,
      traceId: (raw.traceId || raw.trace_id) as string | undefined,
      spanId: (raw.spanId || raw.span_id) as string | undefined,
      timestamp,
      severity: normalizeSeverity(raw.severityNumber as number | undefined, (raw.severityText || raw.severity) as string | undefined),
      message: messageStr,
      attributes,
      stackTrace: String(attributes['exception.stacktrace'] || attributes['exception.message'] || ''),
      raw
    });
  }

  for (const recordObj of records) {
    const record = recordObj as Record<string, unknown>;
    let handled = false;
    
    if (record.resourceSpans && Array.isArray(record.resourceSpans)) {
      handled = true;
      for (const rs of record.resourceSpans) {
        const resourceAttrs = parseAttributes(rs.resource?.attributes);
        for (const ss of rs.scopeSpans || []) {
          const scopeAttrs = parseAttributes(ss.scope?.attributes);
          for (const span of ss.spans || []) {
            processSpan(span, resourceAttrs, scopeAttrs);
          }
        }
      }
    }
    
    if (record.resourceLogs && Array.isArray(record.resourceLogs)) {
      handled = true;
      for (const rl of record.resourceLogs) {
        const resourceAttrs = parseAttributes(rl.resource?.attributes);
        for (const sl of rl.scopeLogs || []) {
          const scopeAttrs = parseAttributes(sl.scope?.attributes);
          for (const log of sl.logRecords || []) {
            processLog(log, resourceAttrs, scopeAttrs);
          }
        }
      }
    }
    
    if (!record.resourceSpans && !record.resourceLogs) {
      if ((record.spanId || record.span_id) && (record.traceId || record.trace_id)) {
        handled = true;
        if (record.startTime !== undefined || record.name !== undefined || record.durationMs !== undefined) processSpan(record);
        else processLog(record);
      } else if (record.timestamp !== undefined || record.timeUnixNano !== undefined || record.body !== undefined || record.message !== undefined) {
        handled = true;
        processLog(record);
      }
    }

    if (!handled) {
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
    const spanById = new Map<string, Span>();
    const childrenByParentId = new Map<string | undefined, Span[]>();
    const logsBySpanId = new Map<string | undefined, LogEvent[]>();
    const errorSpanIds = new Set<string>();

    for (const span of spans) {
      spanById.set(span.spanId, span);
      if (!childrenByParentId.has(span.parentSpanId)) {
        childrenByParentId.set(span.parentSpanId, []);
      }
      childrenByParentId.get(span.parentSpanId)!.push(span);
      if (span.status.code === 'ERROR' || (span.attributes['http.response.status_code'] as number) >= 500 || (span.attributes['http.status_code'] as number) >= 500) {
        errorSpanIds.add(span.spanId);
      }
    }

    for (const log of logs) {
      if (!logsBySpanId.has(log.spanId)) {
        logsBySpanId.set(log.spanId, []);
      }
      logsBySpanId.get(log.spanId)!.push(log);
    }

    const indexes = { spanById, childrenByParentId, logsBySpanId, errorSpanIds };

    traces.push({
      traceId,
      spans,
      logs,
      startTime,
      endTime,
      durationMs: Math.max(0, endTime - startTime),
      indexes
    });
  }
  
  // Sort traces by error count, then duration
  traces.sort((a, b) => {
    const isErr = (s: Span) => s.status.code === 'ERROR' || (s.attributes['http.response.status_code'] as number) >= 500 || (s.attributes['http.status_code'] as number) >= 500;
    const aErrs = a.spans.filter(isErr).length;
    const bErrs = b.spans.filter(isErr).length;
    if (aErrs !== bErrs) return bErrs - aErrs;
    return b.durationMs - a.durationMs;
  });

  return { dataset: { traces }, issues };
}
