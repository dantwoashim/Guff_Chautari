import { describe, expect, it } from 'vitest';
import type { Council } from '../../council/types';
import { runBoardroomDebate } from '../debateOrchestrator';
import type { BoardroomSession, DebatePipelineRunner } from '../types';

const council: Council = {
  id: 'council-1',
  userId: 'user-1',
  name: 'Launch Council',
  members: [
    { id: 'm1', personaId: 'p1', name: 'Strategist', roleHint: 'Execution strategy', stanceSeed: 1 },
    { id: 'm2', personaId: 'p2', name: 'Analyst', roleHint: 'Metrics first', stanceSeed: 2 },
    { id: 'm3', personaId: 'p3', name: 'Operator', roleHint: 'Operational constraints', stanceSeed: 3 },
    { id: 'm4', personaId: 'p4', name: 'Skeptic', roleHint: 'Risk discovery', stanceSeed: 4 },
    { id: 'm5', personaId: 'p5', name: 'Coach', roleHint: 'People impact', stanceSeed: 5 },
  ],
  createdAtIso: '2026-02-18T00:00:00.000Z',
  updatedAtIso: '2026-02-18T00:00:00.000Z',
};

const session: BoardroomSession = {
  id: 'session-1',
  userId: 'user-1',
  councilId: council.id,
  framingPrompt: 'Should we launch the public beta in March?',
  mode: 'round_robin',
  roundCount: 2,
  limits: {
    maxTokensPerTurn: 350,
    maxDurationMsPerTurn: 2_500,
  },
  status: 'running',
  startedAtIso: '2026-02-18T10:00:00.000Z',
};

const makeRunner = (): DebatePipelineRunner => {
  return async ({ member, round, turnIndex, priorArguments }) => {
    const position = turnIndex % 3 === 0 ? 'support' : turnIndex % 3 === 1 ? 'mixed' : 'oppose';
    const counterArgumentToId = priorArguments.length > 0 ? priorArguments[priorArguments.length - 1].id : undefined;

    return {
      text: JSON.stringify({
        position,
        claim: `${member.name} recommends action path for round ${round}.`,
        evidence: [`evidence-${member.id}`, `round-${round}`],
        confidence: 0.62 + (turnIndex % 4) * 0.08,
        counterArgumentToId,
      }),
    };
  };
};

describe('runBoardroomDebate', () => {
  it('runs 2 rounds for a 5-member council with strict turn order', async () => {
    const result = await runBoardroomDebate({
      session,
      council,
      pipelineRunner: makeRunner(),
    });

    expect(result.turnRecords).toHaveLength(10);
    expect(result.arguments).toHaveLength(10);

    const expectedOrder = [...council.members.map((member) => member.id), ...council.members.map((member) => member.id)];
    expect(result.turnRecords.map((turn) => turn.memberId)).toEqual(expectedOrder);
    expect(result.turnRecords.map((turn) => turn.status)).toEqual(new Array(10).fill('completed'));

    for (const member of council.members) {
      const turns = result.turnRecords.filter((turn) => turn.memberId === member.id);
      expect(turns).toHaveLength(2);
    }

    expect(result.turnRecords.every((turn) => turn.evidence.length > 0)).toBe(true);
    expect(result.turnRecords.every((turn) => turn.confidence >= 0 && turn.confidence <= 1)).toBe(true);
  });

  it('supports moderator-directed sequences when provided', async () => {
    const result = await runBoardroomDebate({
      session: {
        ...session,
        id: 'session-2',
        mode: 'moderator_directed',
        roundCount: 1,
      },
      council,
      moderatorSequence: ['m3', 'm1', 'm5', 'm2', 'm4'],
      pipelineRunner: makeRunner(),
    });

    expect(result.turnRecords.map((turn) => turn.memberId)).toEqual(['m3', 'm1', 'm5', 'm2', 'm4']);
  });
});
