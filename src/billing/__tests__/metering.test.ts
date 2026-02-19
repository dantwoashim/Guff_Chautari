import { describe, expect, it } from 'vitest';
import { UsageMeteringEngine } from '../metering';

describe('billing usage metering', () => {
  it('accumulates usage and flushes every 5 seconds', () => {
    let nowMs = Date.parse('2026-12-01T00:00:00.000Z');
    const metering = new UsageMeteringEngine({
      flushIntervalMs: 5_000,
      nowMs: () => nowMs,
    });

    for (let index = 0; index < 100; index += 1) {
      metering.recordUsage({
        workspaceId: 'ws-metering',
        subscriptionId: 'sub-metering',
        metric: 'api_calls',
      });
    }

    expect(metering.listUsageRecords()).toHaveLength(0);

    nowMs += 5_100;
    const flushedCount = metering.flushIfDue(new Date(nowMs).toISOString());
    expect(flushedCount).toBe(1);

    const usageRows = metering.listUsageRecords({
      workspaceId: 'ws-metering',
      metric: 'api_calls',
    });
    expect(usageRows).toHaveLength(1);
    expect(usageRows[0].quantity).toBe(100);

    const report = metering.summarizeUsage({
      workspaceId: 'ws-metering',
      subscriptionId: 'sub-metering',
    });
    expect(report.totalQuantity).toBe(100);
    expect(report.rows[0].metric).toBe('api_calls');
    expect(report.rows[0].quantity).toBe(100);
  });
});
