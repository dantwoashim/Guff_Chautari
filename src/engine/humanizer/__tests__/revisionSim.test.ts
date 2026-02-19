import { describe, expect, it } from 'vitest';
import { simulateRevisionEvent } from '../revisionSim';

describe('simulateRevisionEvent', () => {
  it('triggers revision behavior on emotionally complex input', () => {
    const result = simulateRevisionEvent({
      text: 'I need to tell you something difficult and I am not sure how to phrase it?',
      emotionalComplexity: 0.82,
      containsQuestion: true,
    });

    expect(result.shouldRevise).toBe(true);
    expect(result.pauseMs).toBeGreaterThan(0);
  });
});
