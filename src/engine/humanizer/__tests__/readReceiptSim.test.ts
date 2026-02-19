import { describe, expect, it } from 'vitest';
import { simulateReadReceiptDelay } from '../readReceiptSim';

describe('simulateReadReceiptDelay', () => {
  it('increases read delay with emotional complexity', () => {
    const low = simulateReadReceiptDelay(80, 0.1);
    const high = simulateReadReceiptDelay(80, 0.9);

    expect(high).toBeGreaterThan(low);
  });
});
