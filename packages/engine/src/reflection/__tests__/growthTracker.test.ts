import { describe, expect, it } from 'vitest';
import { derivePersonaEvolution } from '../growthTracker';

describe('growthTracker', () => {
  it('derives evolution vectors from reflection patterns', () => {
    const evolution = derivePersonaEvolution([
      {
        id: 'p1',
        kind: 'topic',
        label: 'Frequent topic: launch',
        occurrences: 5,
        trend: 'rising',
      },
      {
        id: 'p2',
        kind: 'relationship',
        label: 'Relationship warmth signals increased',
        occurrences: 3,
        trend: 'stable',
      },
      {
        id: 'p3',
        kind: 'emotion',
        label: 'Stress cues appeared repeatedly',
        occurrences: 4,
        trend: 'rising',
      },
    ]);

    expect(evolution.vocabularyAdds).toContain('launch');
    expect(evolution.stanceAdjustments.length).toBeGreaterThanOrEqual(1);
  });
});
