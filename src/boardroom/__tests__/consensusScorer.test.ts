import { describe, expect, it } from 'vitest';
import type { Council } from '../../council/types';
import { scoreBoardroomConsensus } from '../consensusScorer';
import type { Argument } from '../types';

const council: Council = {
  id: 'council-1',
  userId: 'user-1',
  name: 'Launch Council',
  members: [
    { id: 'm1', personaId: 'p1', name: 'Strategist', stanceSeed: 1 },
    { id: 'm2', personaId: 'p2', name: 'Analyst', stanceSeed: 2 },
    { id: 'm3', personaId: 'p3', name: 'Operator', stanceSeed: 3 },
    { id: 'm4', personaId: 'p4', name: 'Skeptic', stanceSeed: 4 },
    { id: 'm5', personaId: 'p5', name: 'Coach', stanceSeed: 5 },
  ],
  createdAtIso: '2026-02-18T00:00:00.000Z',
  updatedAtIso: '2026-02-18T00:00:00.000Z',
};

const argumentsLog: Argument[] = [
  {
    id: 'a1',
    sessionId: 'session-1',
    councilId: council.id,
    memberId: 'm1',
    memberName: 'Strategist',
    round: 1,
    turnIndex: 0,
    position: 'support',
    claim: 'Ship in March with a controlled phased rollout.',
    supportingEvidence: ['phased rollout', 'cost savings from fast iteration'],
    confidence: 0.83,
    prompt: 'prompt',
    rawResponse: 'raw',
    createdAtIso: '2026-02-18T10:00:00.000Z',
  },
  {
    id: 'a2',
    sessionId: 'session-1',
    councilId: council.id,
    memberId: 'm2',
    memberName: 'Analyst',
    round: 1,
    turnIndex: 1,
    position: 'support',
    claim: 'Launch with strict KPI gates and weekly trend checks.',
    supportingEvidence: ['phased rollout', 'retention trend improved in pilot'],
    confidence: 0.79,
    prompt: 'prompt',
    rawResponse: 'raw',
    createdAtIso: '2026-02-18T10:00:10.000Z',
  },
  {
    id: 'a3',
    sessionId: 'session-1',
    councilId: council.id,
    memberId: 'm3',
    memberName: 'Operator',
    round: 1,
    turnIndex: 2,
    position: 'mixed',
    claim: 'Proceed only with staged onboarding and rollback playbooks.',
    supportingEvidence: ['phased rollout', 'rollback checklist ready'],
    confidence: 0.72,
    prompt: 'prompt',
    rawResponse: 'raw',
    createdAtIso: '2026-02-18T10:00:20.000Z',
  },
  {
    id: 'a4',
    sessionId: 'session-1',
    councilId: council.id,
    memberId: 'm4',
    memberName: 'Skeptic',
    round: 1,
    turnIndex: 3,
    position: 'oppose',
    claim: 'Delay launch; current support team cannot handle surge risks.',
    supportingEvidence: ['team bandwidth risk', 'incident load is rising'],
    confidence: 0.76,
    prompt: 'prompt',
    rawResponse: 'raw',
    createdAtIso: '2026-02-18T10:00:30.000Z',
  },
  {
    id: 'a5',
    sessionId: 'session-1',
    councilId: council.id,
    memberId: 'm5',
    memberName: 'Coach',
    round: 1,
    turnIndex: 4,
    position: 'support',
    claim: 'Ship with clear comms and constrained capacity ramp.',
    supportingEvidence: ['phased rollout', 'customer demand signal is strong'],
    confidence: 0.81,
    prompt: 'prompt',
    rawResponse: 'raw',
    createdAtIso: '2026-02-18T10:00:40.000Z',
  },
];

describe('scoreBoardroomConsensus', () => {
  it('computes confidence-adjusted alignment and highlights consensus/tension', () => {
    const score = scoreBoardroomConsensus({
      sessionId: 'session-1',
      council,
      arguments: argumentsLog,
      nowIso: '2026-02-18T11:00:00.000Z',
    });

    expect(score.agreementMatrix).toHaveLength(15);
    expect(score.rawAlignment).toBeGreaterThan(0.35);
    expect(score.rawAlignment).toBeLessThan(0.9);
    expect(score.score).toBeGreaterThan(0.35);
    expect(score.score).toBeLessThan(0.9);
    expect(score.convergenceZones).toContain('phased rollout');
    expect(score.unresolvedTensions.length).toBeGreaterThan(0);
  });
});
