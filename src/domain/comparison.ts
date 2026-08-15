import { Trace } from './model';
import { calculateMetrics } from './metrics';

export interface TraceDiffResult {
  metricsDiff: {
    durationDeltaMs: number;
    spanCountDelta: number;
    errorRateDelta: number;
  };
  missingServicesInB: string[];
  newServicesInB: string[];
}

export function compareTraces(traceA: Trace, traceB: Trace): TraceDiffResult {
  const metricsA = calculateMetrics(traceA);
  const metricsB = calculateMetrics(traceB);

  const servicesA = new Set(traceA.spans.map(s => s.serviceName));
  const servicesB = new Set(traceB.spans.map(s => s.serviceName));

  const missingServicesInB = Array.from(servicesA).filter(s => !servicesB.has(s));
  const newServicesInB = Array.from(servicesB).filter(s => !servicesA.has(s));

  return {
    metricsDiff: {
      durationDeltaMs: metricsB.totalTraceTimeMs - metricsA.totalTraceTimeMs,
      spanCountDelta: metricsB.spanCount - metricsA.spanCount,
      errorRateDelta: metricsB.errorRate - metricsA.errorRate,
    },
    missingServicesInB,
    newServicesInB
  };
}
