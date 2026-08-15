import { Span, Trace } from './model';
import { calculateExclusiveTime } from './timing';

export interface TraceMetrics {
  totalTraceTimeMs: number;
  spanCount: number;
  errorRate: number;
  bottleneckSpan: Span | null;
}

export function calculateMetrics(trace: Trace): TraceMetrics {
  if (trace.spans.length === 0) {
    return { totalTraceTimeMs: 0, spanCount: 0, errorRate: 0, bottleneckSpan: null };
  }
  
  const totalTraceTimeMs = trace.durationMs;
  const spanCount = trace.spans.length;
  
  let errorSpans = 0;
  for (const span of trace.spans) {
    const isErrorStatus = span.status.code === 'ERROR';
    const httpStatus = span.attributes['http.response.status_code'] ?? span.attributes['http.status_code'];
    const isHttpError = typeof httpStatus === 'number' && httpStatus >= 500;
    
    const spanLogs = trace.indexes?.logsBySpanId.get(span.spanId) || trace.logs.filter(l => l.spanId === span.spanId);
    const hasExceptionLog = spanLogs.some(l => l.attributes['exception.type'] || l.attributes['exception.message']);
    
    if (isErrorStatus || isHttpError || hasExceptionLog) {
      errorSpans++;
    }
  }
  
  const errorRate = spanCount > 0 ? errorSpans / spanCount : 0;
  
  let bottleneckSpan: Span | null = null;
  let maxExclusive = -1;
  let rootMax = -1;
  let rootBottleneck: Span | null = null;
  
  for (const span of trace.spans) {
    const children = trace.indexes?.childrenByParentId.get(span.spanId) || trace.spans.filter(s => s.parentSpanId === span.spanId);
    const exclusive = calculateExclusiveTime(span, children);
    
    if (!span.parentSpanId) {
      if (exclusive > rootMax) {
        rootMax = exclusive;
        rootBottleneck = span;
      }
    } else {
      if (exclusive > maxExclusive) {
        maxExclusive = exclusive;
        bottleneckSpan = span;
      }
    }
  }
  
  if (!bottleneckSpan || rootMax > maxExclusive) {
    bottleneckSpan = rootBottleneck;
  }
  
  return { totalTraceTimeMs, spanCount, errorRate, bottleneckSpan };
}
