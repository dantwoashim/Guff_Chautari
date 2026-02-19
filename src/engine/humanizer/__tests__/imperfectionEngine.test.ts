import { describe, expect, it } from 'vitest';
import { applyImperfections } from '../imperfectionEngine';

describe('applyImperfections', () => {
  it('applies deterministic imperfections when enabled', () => {
    const base = 'You should really trust your weekly process.';
    const output = applyImperfections(base, { enabled: true, intensity: 0.8, seed: 42 });

    expect(output).not.toBe(base);
  });

  it('returns original text when disabled', () => {
    const base = 'You should really trust your weekly process.';
    const output = applyImperfections(base, { enabled: false, intensity: 1, seed: 42 });

    expect(output).toBe(base);
  });
});
