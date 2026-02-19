import { describe, expect, it } from 'vitest';
import { runCouncilDebate, type Council } from '../index';

const council: Council = {
  id: 'council-int',
  userId: 'user-int',
  name: 'Career Board',
  members: [
    { id: 'm1', personaId: 'p1', name: 'Planner', stanceSeed: 11 },
    { id: 'm2', personaId: 'p2', name: 'Operator', stanceSeed: 21 },
    { id: 'm3', personaId: 'p3', name: 'Realist', stanceSeed: 31 },
  ],
  createdAtIso: '2026-02-16T00:00:00.000Z',
  updatedAtIso: '2026-02-16T00:00:00.000Z',
};

const fiveMemberCouncil: Council = {
  id: 'council-five',
  userId: 'user-int',
  name: 'Launch Council',
  members: [
    { id: 'm1', personaId: 'p1', name: 'Planner', stanceSeed: 11 },
    { id: 'm2', personaId: 'p2', name: 'Operator', stanceSeed: 21 },
    { id: 'm3', personaId: 'p3', name: 'Realist', stanceSeed: 31 },
    { id: 'm4', personaId: 'p4', name: 'Coach', stanceSeed: 41 },
    { id: 'm5', personaId: 'p5', name: 'Builder', stanceSeed: 51 },
  ],
  createdAtIso: '2026-02-16T00:00:00.000Z',
  updatedAtIso: '2026-02-16T00:00:00.000Z',
};

describe('council integration', () => {
  it('produces perspectives plus synthesis with minority view', async () => {
    const result = await runCouncilDebate({
      council,
      prompt: 'Should I change jobs this quarter?',
      nowIso: '2026-02-16T12:30:00.000Z',
    });

    expect(result.perspectives).toHaveLength(3);
    expect(result.synthesis.recommendedAction.length).toBeGreaterThan(10);
    expect(result.synthesis.references).toHaveLength(3);
    expect(result.synthesis.minorityView.length).toBeGreaterThan(10);
  });

  it('meets the 5-member perspective latency budget and includes disagreement signals', async () => {
    const result = await runCouncilDebate({
      council: fiveMemberCouncil,
      prompt: 'Should we launch beta next month?',
      nowIso: '2026-02-16T12:45:00.000Z',
    });

    expect(result.perspectives).toHaveLength(5);
    expect(result.durationMs).toBeLessThanOrEqual(30_000);
    expect(result.synthesis.disagreements.length).toBeGreaterThan(0);
    expect(result.synthesis.references.map((reference) => reference.memberName)).toContain('Planner');
  });
});
