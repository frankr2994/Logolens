import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { FlameGraph } from '../components/FlameGraph';
import { LogStream } from '../components/LogStream';
import { SpanNode } from '../domain/hierarchy';
import { Span, Trace, LogEvent } from '../domain/model';

describe('UI Components & Trace State', () => {
  it('FlameGraph respects retainedSpanIds filter', () => {
    const span1 = { spanId: '1', name: 's1', startTime: 0, durationMs: 10, serviceName: 'A', status: { code: 'OK' }, attributes: {} } as unknown as Span;
    const span2 = { spanId: '2', name: 's2', startTime: 2, durationMs: 5, serviceName: 'A', status: { code: 'OK' }, attributes: {} } as unknown as Span;
    
    const nodes: SpanNode[] = [
      { span: span1, children: [ { span: span2, children: [] } ] }
    ];

    const retained = new Set(['1']); // Exclude span 2
    
    const { container } = render(
      <FlameGraph 
        nodes={nodes} 
        totalTraceTimeMs={10} 
        traceStartMs={0} 
        onSelect={() => {}} 
        retainedSpanIds={retained} 
      />
    );

    // Only span 1 should be rendered
    expect(container.textContent).toContain('s1');
    expect(container.textContent).not.toContain('s2');
  });

  it('LogStream filters by selected span and shows all logs when none selected', () => {
    const logs: LogEvent[] = [
      { id: 'l1', spanId: 's1', severity: 'INFO', message: 'log1', attributes: {}, timestamp: 0, stackTrace: '', raw: {} },
      { id: 'l2', spanId: 's2', severity: 'ERROR', message: 'log2', attributes: {}, timestamp: 0, stackTrace: '', raw: {} }
    ];
    const trace = { startTime: 0, spans: [] } as unknown as Trace;

    const { rerender, container } = render(<LogStream logs={logs} trace={trace} />);
    expect(container.textContent).toContain('log1');
    expect(container.textContent).toContain('log2');

    rerender(<LogStream logs={logs} trace={trace} selectedSpanId="s1" />);
    expect(container.textContent).toContain('log1');
    expect(container.textContent).not.toContain('log2');
  });

  // Since testing App trace-switch requires a bit of mocking file uploads, we'll verify the error states in tests
});
