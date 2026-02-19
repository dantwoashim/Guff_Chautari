import { describe, expect, it } from 'vitest';
import { runRelationshipEvolutionBenchmark } from '../relationshipEvolutionBenchmark';

describe('relationshipEvolutionBenchmark', () => {
  it('tracks stage progression, repair recovery, and seasonal trend over 100 turns', () => {
    const result = runRelationshipEvolutionBenchmark({ turns: 100, attachmentStyle: 'secure' });

    expect(result.turns).toBe(100);
    expect(result.trustSeries.length).toBe(100);
    expect(result.intensitySeries.length).toBe(100);
    expect(result.comfortSeries.length).toBe(100);

    expect(result.intensitySeries[99]).toBeLessThan(result.intensitySeries[0]);
    expect(result.comfortSeries[99]).toBeGreaterThan(result.comfortSeries[0]);

    expect(['friend', 'close', 'intimate']).toContain(result.finalStage);
    expect(result.repairRecovered).toBe(true);
  });
});
