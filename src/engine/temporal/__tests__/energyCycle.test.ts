import { describe, expect, it } from 'vitest';
import {
  applyConversationLoad,
  getEffectiveEnergy,
  initializeEnergyCycle,
  recoverEnergy,
} from '../energyCycle';

describe('energyCycle', () => {
  it('depletes energy after turns and recovers over time', () => {
    const start = new Date('2026-08-11T08:00:00').getTime();
    const cycle = initializeEnergyCycle(start);

    const afterTurns = applyConversationLoad(cycle, 3, start + 10 * 60 * 1000);
    expect(afterTurns.currentEnergy).toBeLessThanOrEqual(cycle.currentEnergy);

    const recovered = recoverEnergy(afterTurns, start + 3 * 60 * 60 * 1000);
    expect(recovered.currentEnergy).toBeGreaterThan(afterTurns.currentEnergy);
  });

  it('computes effective energy in [0,1]', () => {
    const start = new Date('2026-08-11T18:00:00').getTime();
    const cycle = initializeEnergyCycle(start);
    const value = getEffectiveEnergy(cycle, start);

    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(1);
  });
});
