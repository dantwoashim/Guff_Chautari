import { describe, expect, it } from 'vitest';
import { generateSequentialPerspectives, type Council } from '../index';

const makeCouncil = (): Council => ({
  id: 'council-1',
  userId: 'user-1',
  name: 'Launch Council',
  members: [
    { id: 'm1', personaId: 'p1', name: 'Analyst', stanceSeed: 1 },
    { id: 'm2', personaId: 'p2', name: 'Coach', stanceSeed: 2 },
    { id: 'm3', personaId: 'p3', name: 'Skeptic', stanceSeed: 3 },
    { id: 'm4', personaId: 'p4', name: 'Creative', stanceSeed: 4 },
    { id: 'm5', personaId: 'p5', name: 'Executor', stanceSeed: 5 },
  ],
  createdAtIso: '2026-02-16T00:00:00.000Z',
  updatedAtIso: '2026-02-16T00:00:00.000Z',
});

describe('perspectiveGenerator', () => {
  it('generates one perspective per member with distinct framing', async () => {
    const perspectives = await generateSequentialPerspectives({
      council: makeCouncil(),
      prompt: 'Should we launch beta this month?',
      nowIso: '2026-02-16T12:00:00.000Z',
    });

    expect(perspectives).toHaveLength(5);
    const styles = new Set(perspectives.map((item) => item.style));
    expect(styles.size).toBeGreaterThanOrEqual(4);
    expect(perspectives.every((item) => item.response.includes('Action bias:'))).toBe(true);
  });
});
