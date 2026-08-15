import { Span, LogEvent } from './model';
import { calculateExclusiveTime } from './timing';

export interface TraceMetrics {
  totalTraceTimeMs: number;
  spanCount: number;
  errorRate: number;
  bottleneckSpan: Span | null;
}

export function calculateMetrics(spans: Span[], logs: LogEvent[]): TraceMetrics {
  if (spans.length === 0) {
    return { totalTraceTimeMs: 0, spanCount: 0, errorRate: 0, bottleneckSpan: null };
  }
  
  const minStart = Math.min(...spans.map(s => s.startTime));
  const maxEnd = Math.max(...spans.map(s => s.endTime));
  const totalTraceTimeMs = Math.max(0, maxEnd - minStart);
  
  const spanCount = spans.length;
  
  let errorSpans = 0;
  for (const span of spans) {
    const isErrorStatus = span.status.code === 'ERROR';
    const httpStatus = span.attributes['http.response.status_code'] ?? span.attributes['http.status_code'];
    const isHttpError = typeof httpStatus === 'number' && httpStatus >= 500;
    const hasExceptionLog = logs.some(l => l.spanId === span.spanId && (l.attributes['exception.type'] || l.attributes['exception.message']));
    
    if (isErrorStatus || isHttpError || hasExceptionLog) {
      errorSpans++;
    }
  }
  
  const errorRate = spanCount > 0 ? errorSpans / spanCount : 0;
  
  const childrenMap = new Map<string, Span[]>();
  for (const s of spans) childrenMap.set(s.spanId, []);
  for (const s of spans) {
    if (s.parentSpanId && childrenMap.has(s.parentSpanId)) {
      childrenMap.get(s.parentSpanId)!.push(s);
    }
  }
  
  let bottleneckSpan: Span | null = null;
  let maxExclusive = -1;
  let rootMax = -1;
  let rootBottleneck: Span | null = null;
  
  for (const span of spans) {
    const children = childrenMap.get(span.spanId) || [];
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
  
  // If non-root exists, we use it only if its exclusive time is "significant".
  // But actually the finding says: "A 1 ms child will be reported instead of a root with 999 ms exclusive time."
  // So we should just pick the global max, but we might optionally prefer children to roots on a tie, 
  // or only prefer children if we explicitly want to exclude the root. 
  // But to fix the finding: "regardless of exclusive duration". We should just pick the absolute max.
  if (!bottleneckSpan || rootMax > maxExclusive) {
    bottleneckSpan = rootBottleneck;
  }
  
  return { totalTraceTimeMs, spanCount, errorRate, bottleneckSpan };
}
