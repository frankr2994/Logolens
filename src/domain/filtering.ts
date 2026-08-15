import { Span, LogEvent } from './model';

export interface FilterState {
  services: string[];
  httpStatusCodes: string[];
  severities: string[];
  minDurationMs: number | null;
  searchQuery: string;
}

function matchesSearch(span: Span, query: string, logs: LogEvent[]): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  if (span.name.toLowerCase().includes(q)) return true;
  
  for (const [k, v] of Object.entries(span.attributes)) {
    if (k.toLowerCase().includes(q)) return true;
    if (String(v).toLowerCase().includes(q)) return true;
  }
  
  const spanLogs = logs.filter(l => l.spanId === span.spanId);
  for (const log of spanLogs) {
    if (log.message.toLowerCase().includes(q)) return true;
    if (log.stackTrace?.toLowerCase().includes(q)) return true;
    for (const [k, v] of Object.entries(log.attributes)) {
      if (k.toLowerCase().includes(q)) return true;
      if (String(v).toLowerCase().includes(q)) return true;
    }
  }
  
  return false;
}

function getHttpStatusCode(span: Span): string | null {
  const status = span.attributes['http.response.status_code'] ?? span.attributes['http.status_code'];
  return status ? String(status) : null;
}

export function filterSpans(spans: Span[], logs: LogEvent[], filters: FilterState): Set<string> {
  const matchedSpanIds = new Set<string>();
  
  for (const span of spans) {
    let match = true;
    
    if (filters.services.length > 0 && !filters.services.includes(span.serviceName)) {
      match = false;
    }
    
    if (match && filters.httpStatusCodes.length > 0) {
      const code = getHttpStatusCode(span);
      if (!code || !filters.httpStatusCodes.includes(code)) {
        match = false;
      }
    }
    
    if (match && filters.severities.length > 0) {
      const spanLogs = logs.filter(l => l.spanId === span.spanId);
      const hasMatchingLog = spanLogs.some(l => filters.severities.includes(l.severity));
      if (!hasMatchingLog) {
        match = false;
      }
    }
    
    if (match && filters.minDurationMs !== null && span.durationMs < filters.minDurationMs) {
      match = false;
    }
    
    if (match && !matchesSearch(span, filters.searchQuery, logs)) {
      match = false;
    }
    
    if (match) {
      matchedSpanIds.add(span.spanId);
    }
  }
  
  return matchedSpanIds;
}

export function getRetainedSpanIds(spans: Span[], matchedSpanIds: Set<string>): Set<string> {
  const retained = new Set<string>();
  const map = new Map<string, Span>();
  for (const s of spans) map.set(s.spanId, s);
  
  for (const spanId of matchedSpanIds) {
    let curr: string | undefined = spanId;
    while (curr) {
      if (retained.has(curr)) break;
      retained.add(curr);
      curr = map.get(curr)?.parentSpanId;
    }
  }
  
  return retained;
}
