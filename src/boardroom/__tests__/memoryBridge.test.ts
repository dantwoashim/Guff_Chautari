import { describe, expect, it } from 'vitest';
import { ActivityStore, createInMemoryActivityStoreAdapter, listActivityEvents } from '../../activity';
import {
  KnowledgeGraphStore,
  createInMemoryKnowledgeStoreAdapter,
} from '../../knowledge';
import { persistBoardroomConclusion } from '../memoryBridge';
import type { Argument, BoardroomSession, ConsensusScore } from '../types';

const session: BoardroomSession = {
  id: 'boardroom-session-memory-1',
  userId: 'user-memory-1',
  councilId: 'council-memory-1',
  framingPrompt: 'Should we launch onboarding v2 next month?',
  mode: 'round_robin',
  roundCount: 2,
  limits: {
    maxTokensPerTurn: 320,
    maxDurationMsPerTurn: 6_000,
  },
  status: 'completed',
  startedAtIso: '2026-02-19T10:00:00.000Z',
  completedAtIso: '2026-02-19T10:10:00.000Z',
};

const argumentsLog: Argument[] = [
  {
    id: 'a1',
    sessionId: session.id,
    councilId: session.councilId,
    memberId: 'm1',
    memberName: 'Strategist',
    round: 1,
    turnIndex: 0,
    position: 'support',
    claim: 'Ship with staged rollout and explicit rollback gates.',
    supportingEvidence: ['pilot retention is up', 'rollback playbook already exists'],
    confidence: 0.82,
    prompt: 'prompt',
    rawResponse: 'raw',
    createdAtIso: '2026-02-19T10:01:00.000Z',
  },
  {
    id: 'a2',
    sessionId: session.id,
    councilId: session.councilId,
    memberId: 'm2',
    memberName: 'Skeptic',
    round: 1,
    turnIndex: 1,
    position: 'oppose',
    claim: 'Delay if support team staffing risks remain unresolved.',
    supportingEvidence: ['support load trend is volatile'],
    confidence: 0.74,
    counterArgumentToId: 'a1',
    prompt: 'prompt',
    rawResponse: 'raw',
    createdAtIso: '2026-02-19T10:02:00.000Z',
  },
];

const consensus: ConsensusScore = {
  sessionId: session.id,
  councilId: session.councilId,
  rawAlignment: 0.61,
  score: 0.64,
  agreementMatrix: [
    {
      memberAId: 'm1',
      memberBId: 'm2',
      alignment: 0.59,
      averageConfidence: 0.78,
      roundsCompared: 1,
    },
  ],
  convergenceZones: ['staged rollout'],
  unresolvedTensions: ['Launch timing remains contested due to support load risk.'],
  scoredAtIso: '2026-02-19T10:10:00.000Z',
};

describe('boardroom memory bridge', () => {
  it('writes boardroom completion to activity timeline and ingests conclusion into knowledge graph', () => {
    const activity = new ActivityStore(createInMemoryActivityStoreAdapter());
    const knowledge = new KnowledgeGraphStore(createInMemoryKnowledgeStoreAdapter());

    const result = persistBoardroomConclusion(
      {
        userId: session.userId,
        session,
        arguments: argumentsLog,
        consensus,
        threadId: 'thread-memory-1',
        nowIso: '2026-02-19T10:11:00.000Z',
      },
      {
        activityStore: activity,
        knowledgeStore: knowledge,
      }
    );

    expect(result.conclusionText).toContain('Consensus score');
    expect(result.conclusionText).toContain(session.framingPrompt);

    const events = listActivityEvents(
      {
        userId: session.userId,
        limit: 20,
      },
      activity
    );

    expect(events.map((event) => event.eventType)).toContain('boardroom.session_completed');
    expect(events.map((event) => event.eventType)).toContain('boardroom.conclusion_ingested');

    const graph = knowledge.load(session.userId);
    expect(graph.sources.length).toBeGreaterThan(0);
    expect(graph.sources.some((source) => source.title.startsWith('Boardroom Conclusion:'))).toBe(true);
    expect(graph.nodes.some((node) => node.text.includes('Consensus score'))).toBe(true);
  });
});
