import { describe, expect, it } from 'vitest';
import type { Council } from '../../council';
import {
  appendDecisionEvidence,
  DecisionEvidenceStore,
  listDecisionEvidence,
  createInMemoryDecisionEvidenceStoreAdapter,
  type DecisionMatrix,
} from '../../decision';
import { runBoardroomDebate } from '../debateOrchestrator';
import { scoreBoardroomConsensus } from '../consensusScorer';
import {
  buildBoardroomFramingFromDecision,
  createBoardroomSessionFromDecision,
  exportBoardroomConsensusToDecisionEvidence,
} from '../decisionBridge';

const matrix: DecisionMatrix = {
  id: 'decision-matrix-1',
  question: 'Should we launch the new onboarding flow in March?',
  criteria: [
    { id: 'impact', title: 'Impact', description: 'Expected user uplift', weight: 0.5 },
    { id: 'risk', title: 'Risk', description: 'Potential downside', weight: 0.3 },
    { id: 'speed', title: 'Speed', description: 'Execution timeline', weight: 0.2 },
  ],
  options: [
    {
      id: 'opt-1',
      title: 'Launch in March',
      description: 'Ship with controlled ramp and alerts.',
      scores: { impact: 0.84, risk: 0.61, speed: 0.78 },
    },
    {
      id: 'opt-2',
      title: 'Delay to April',
      description: 'Invest in extra QA and internal testing.',
      scores: { impact: 0.68, risk: 0.82, speed: 0.42 },
    },
  ],
  assumptions: [
    { id: 'a1', text: 'Current telemetry is representative.', confidence: 0.62, impact: 'high' },
    { id: 'a2', text: 'Support load remains manageable.', confidence: 0.55, impact: 'high' },
  ],
  branches: [],
  created_at_iso: '2026-02-19T09:00:00.000Z',
};

const council: Council = {
  id: 'council-bridge-1',
  userId: 'user-bridge-1',
  name: 'Launch Council',
  members: [
    { id: 'm1', personaId: 'p1', name: 'Strategist', stanceSeed: 1 },
    { id: 'm2', personaId: 'p2', name: 'Analyst', stanceSeed: 2 },
    { id: 'm3', personaId: 'p3', name: 'Operator', stanceSeed: 3 },
    { id: 'm4', personaId: 'p4', name: 'Skeptic', stanceSeed: 4 },
    { id: 'm5', personaId: 'p5', name: 'Coach', stanceSeed: 5 },
  ],
  createdAtIso: '2026-02-19T09:00:00.000Z',
  updatedAtIso: '2026-02-19T09:00:00.000Z',
};

describe('boardroom decision bridge integration', () => {
  it('imports a decision matrix into boardroom and exports consensus back as decision evidence', async () => {
    const evidenceStore = new DecisionEvidenceStore(createInMemoryDecisionEvidenceStoreAdapter());
    const userId = 'user-bridge-1';

    const framing = buildBoardroomFramingFromDecision(matrix);
    expect(framing).toContain(matrix.question);
    expect(framing).toContain('Options under review');

    const session = createBoardroomSessionFromDecision({
      userId,
      councilId: council.id,
      matrix,
      roundCount: 2,
      nowIso: '2026-02-19T09:15:00.000Z',
    });

    const debateResult = await runBoardroomDebate({
      session,
      council,
      pipelineRunner: async ({ member, round, turnIndex, priorArguments }) => {
        const position = turnIndex % 3 === 0 ? 'support' : turnIndex % 3 === 1 ? 'mixed' : 'oppose';
        return {
          text: JSON.stringify({
            position,
            claim: `${member.name} position for round ${round}.`,
            evidence: [`option-signal-${(turnIndex % 2) + 1}`, `round-${round}`],
            confidence: 0.6 + (turnIndex % 3) * 0.1,
            counterArgumentToId: priorArguments[priorArguments.length - 1]?.id,
          }),
        };
      },
    });

    const consensus = scoreBoardroomConsensus({
      sessionId: session.id,
      council,
      arguments: debateResult.arguments,
      nowIso: '2026-02-19T09:20:00.000Z',
    });

    const exported = exportBoardroomConsensusToDecisionEvidence(
      {
        userId,
        matrixId: matrix.id,
        session,
        consensus,
        arguments: debateResult.arguments,
        nowIso: '2026-02-19T09:21:00.000Z',
      },
      evidenceStore
    );

    const decisionEvidence = listDecisionEvidence(
      {
        userId,
        matrixId: matrix.id,
      },
      evidenceStore
    );

    expect(decisionEvidence).toHaveLength(1);
    expect(decisionEvidence[0].id).toBe(exported.id);
    expect(decisionEvidence[0].content.toLowerCase()).toContain('boardroom consensus');
    expect(decisionEvidence[0].source_id).toBe(session.id);

    appendDecisionEvidence(
      {
        userId,
        matrixId: matrix.id,
        evidence: {
          ...exported,
          id: `${exported.id}-manual`,
          content: 'Manual follow-up evidence',
        },
      },
      evidenceStore
    );

    expect(
      listDecisionEvidence(
        {
          userId,
          matrixId: matrix.id,
        },
        evidenceStore
      )
    ).toHaveLength(2);
  });
});
