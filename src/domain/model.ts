export type AttributeValue =
  | string
  | number
  | boolean
  | null
  | AttributeValue[]
  | { [key: string]: AttributeValue };

export type SpanStatusCode = 'UNSET' | 'OK' | 'ERROR';

export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  serviceName: string;
  name: string;
  startTime: number;
  endTime: number;
  durationMs: number;
  status: {
    code: SpanStatusCode;
    message?: string;
  };
  attributes: Record<string, AttributeValue>;
  raw: unknown;
}

export interface LogEvent {
  id: string;
  traceId?: string;
  spanId?: string;
  timestamp: number;
  severity: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  message: string;
  attributes: Record<string, AttributeValue>;
  stackTrace?: string;
  raw: unknown;
}

export interface Trace {
  traceId: string;
  spans: Span[];
  logs: LogEvent[];
  startTime: number;
  endTime: number;
  durationMs: number;
}
