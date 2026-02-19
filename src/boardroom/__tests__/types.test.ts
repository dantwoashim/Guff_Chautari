import { describe, expect, it } from 'vitest';
import type {
  Argument,
  BoardroomSession,
  ConsensusScore,
  CounterArgument,
  TurnRecord,
} from '../types';

describe('boardroom types', () => {
  it('keeps the expected Week 41 core model shape stable', () => {
    const session: BoardroomSession = {
      id: 'session-1',
      userId: 'user-1',
      councilId: 'council-1',
      framingPrompt: 'Should we ship v2 this quarter?',
      mode: 'round_robin',
      roundCount: 2,
      limits: {
        maxTokensPerTurn: 400,
        maxDurationMsPerTurn: 6_000,
      },
      status: 'running',
      startedAtIso: '2026-02-18T10:00:00.000Z',
    };

    const argument: Argument = {
      id: 'argument-1',
      sessionId: session.id,
      councilId: session.councilId,
      memberId: 'member-1',
      memberName: 'Strategist',
      round: 1,
      turnIndex: 0,
      position: 'support',
      claim: 'Ship with a phased rollout and strict quality gates.',
      supportingEvidence: ['Pilot metrics improved retention by 12%.'],
      confidence: 0.81,
      prompt: 'Prompt',
      rawResponse: 'Raw response',
      createdAtIso: '2026-02-18T10:00:10.000Z',
    };

    const counter: CounterArgument = {
      ...argument,
      id: 'argument-2',
      position: 'oppose',
      counterArgumentToId: argument.id,
    };

    const turn: TurnRecord = {
      id: 'turn-1',
      sessionId: session.id,
      round: 1,
      turnIndex: 0,
      memberId: 'member-1',
      memberName: 'Strategist',
      roleHint: 'Risk-aware planner',
      prompt: 'Prompt',
      position: argument.position,
      evidence: argument.supportingEvidence,
      confidence: argument.confidence,
      argumentId: argument.id,
      tokenLimit: 400,
      timeLimitMs: 6_000,
      tokensUsed: 37,
      startedAtIso: '2026-02-18T10:00:00.000Z',
      completedAtIso: '2026-02-18T10:00:10.000Z',
      durationMs: 10_000,
      status: 'completed',
    };

    const score: ConsensusScore = {
      sessionId: session.id,
      councilId: session.councilId,
      rawAlignment: 0.64,
      score: 0.67,
      agreementMatrix: [
        {
          memberAId: 'member-1',
          memberBId: 'member-2',
          alignment: 0.61,
          averageConfidence: 0.75,
          roundsCompared: 2,
        },
      ],
      convergenceZones: ['phased rollout'],
      unresolvedTensions: ['High-confidence split remains.'],
      scoredAtIso: '2026-02-18T10:10:00.000Z',
    };

    expect({
      session: Object.keys(session).sort(),
      argument: Object.keys(argument).sort(),
      counterArgument: Object.keys(counter).sort(),
      turnRecord: Object.keys(turn).sort(),
      consensus: Object.keys(score).sort(),
    }).toMatchInlineSnapshot(`
      {
        "argument": [
          "claim",
          "confidence",
          "councilId",
          "createdAtIso",
          "id",
          "memberId",
          "memberName",
          "position",
          "prompt",
          "rawResponse",
          "round",
          "sessionId",
          "supportingEvidence",
          "turnIndex",
        ],
        "consensus": [
          "agreementMatrix",
          "convergenceZones",
          "councilId",
          "rawAlignment",
          "score",
          "scoredAtIso",
          "sessionId",
          "unresolvedTensions",
        ],
        "counterArgument": [
          "claim",
          "confidence",
          "councilId",
          "counterArgumentToId",
          "createdAtIso",
          "id",
          "memberId",
          "memberName",
          "position",
          "prompt",
          "rawResponse",
          "round",
          "sessionId",
          "supportingEvidence",
          "turnIndex",
        ],
        "session": [
          "councilId",
          "framingPrompt",
          "id",
          "limits",
          "mode",
          "roundCount",
          "startedAtIso",
          "status",
          "userId",
        ],
        "turnRecord": [
          "argumentId",
          "completedAtIso",
          "confidence",
          "durationMs",
          "evidence",
          "id",
          "memberId",
          "memberName",
          "position",
          "prompt",
          "roleHint",
          "round",
          "sessionId",
          "startedAtIso",
          "status",
          "timeLimitMs",
          "tokenLimit",
          "tokensUsed",
          "turnIndex",
        ],
      }
    `);
  });
});
