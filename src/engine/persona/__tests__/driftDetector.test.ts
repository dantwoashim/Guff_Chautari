import { describe, expect, it } from 'vitest';
import { computePersonaConsistency } from '../driftDetector';

describe('computePersonaConsistency', () => {
  it('produces higher consistency for semantically similar responses', () => {
    const similar = computePersonaConsistency([
      { prompt: 'q1', response: 'Focus on one priority and measure progress every day.' },
      { prompt: 'q2', response: 'Pick one priority and track daily progress with clear metrics.' },
      { prompt: 'q3', response: 'Choose one goal and review measurable progress each day.' },
    ]);

    const divergent = computePersonaConsistency([
      { prompt: 'q1', response: 'Talk about football scores and weekend matches.' },
      { prompt: 'q2', response: 'Discuss database indexes and query planners in SQL.' },
      { prompt: 'q3', response: 'Describe cooking recipes with herbs and slow roasting.' },
    ]);

    expect(similar.consistencyScore).toBeGreaterThan(divergent.consistencyScore);
    expect(similar.sampleCount).toBe(3);
  });
});
