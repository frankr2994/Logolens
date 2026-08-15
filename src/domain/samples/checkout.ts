import { Dataset } from '../ingestion';

export const checkoutSample: Dataset = {
  traces: [
    {
      traceId: 'trace-123',
      startTime: 1000,
      endTime: 2000,
      durationMs: 1000,
      spans: [
        {
          traceId: 'trace-123',
          spanId: 'span-root',
          serviceName: 'frontend',
          name: 'Checkout Flow',
          startTime: 1000,
          endTime: 2000,
          durationMs: 1000,
          status: { code: 'ERROR' },
          attributes: { 'http.url': '/checkout' },
          raw: {}
        },
        {
          traceId: 'trace-123',
          spanId: 'span-auth',
          parentSpanId: 'span-root',
          serviceName: 'auth',
          name: 'Authenticate User',
          startTime: 1010,
          endTime: 1050,
          durationMs: 40,
          status: { code: 'OK' },
          attributes: { 'user.id': 'user-456' },
          raw: {}
        },
        {
          traceId: 'trace-123',
          spanId: 'span-inventory',
          parentSpanId: 'span-root',
          serviceName: 'inventory',
          name: 'Check Stock',
          startTime: 1050,
          endTime: 1300,
          durationMs: 250,
          status: { code: 'OK' },
          attributes: { 'db.query': 'SELECT * FROM stock' },
          raw: {}
        },
        {
          traceId: 'trace-123',
          spanId: 'span-payment',
          parentSpanId: 'span-root',
          serviceName: 'payment',
          name: 'Process Payment',
          startTime: 1300,
          endTime: 1990,
          durationMs: 690,
          status: { code: 'ERROR', message: 'Gateway timeout' },
          attributes: { 'http.response.status_code': 504 },
          raw: {}
        },
        {
          traceId: 'trace-123',
          spanId: 'span-db',
          parentSpanId: 'span-inventory',
          serviceName: 'postgres',
          name: 'SELECT stock',
          startTime: 1060,
          endTime: 1290,
          durationMs: 230,
          status: { code: 'OK' },
          attributes: { 'db.statement': 'SELECT * FROM stock WHERE item=1' },
          raw: {}
        }
      ],
      logs: [
        {
          id: 'log-1',
          traceId: 'trace-123',
          spanId: 'span-payment',
          timestamp: 1985,
          severity: 'ERROR',
          message: 'Connection timed out to Stripe API',
          attributes: { 'exception.type': 'TimeoutException' },
          stackTrace: 'at ProcessPayment() line 42',
          raw: {}
        }
      ]
    }
  ]
};
