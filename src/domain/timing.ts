import { Span } from './model';

export function calculateExclusiveTime(span: Span, children: Span[]): number {
  if (children.length === 0) return span.durationMs;
  
  // Clip child intervals to parent bounds
  const intervals = children.map(child => {
    const start = Math.max(span.startTime, child.startTime);
    const end = Math.min(span.endTime, child.endTime);
    return { start, end };
  }).filter(iv => iv.end > iv.start);

  if (intervals.length === 0) return span.durationMs;

  intervals.sort((a, b) => a.start - b.start);

  let overlappingDuration = 0;
  let currentStart = intervals[0].start;
  let currentEnd = intervals[0].end;

  for (let i = 1; i < intervals.length; i++) {
    const iv = intervals[i];
    if (iv.start <= currentEnd) {
      currentEnd = Math.max(currentEnd, iv.end);
    } else {
      overlappingDuration += (currentEnd - currentStart);
      currentStart = iv.start;
      currentEnd = iv.end;
    }
  }
  overlappingDuration += (currentEnd - currentStart);

  return Math.max(0, span.durationMs - overlappingDuration);
}

export function nanoToMs(nanos: bigint): number {
  return Number(nanos) / 1_000_000;
}
