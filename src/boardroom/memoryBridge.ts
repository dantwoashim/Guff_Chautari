import {
  emitActivityEvent,
  type ActivityEvent,
  type ActivityStore,
  activityStore,
} from '../activity';
import {
  ingestKnowledgeNote,
  type IngestKnowledgeResult,
  type KnowledgeGraphStore,
  knowledgeGraphStore,
} from '../knowledge';
import type { Argument, BoardroomSession, ConsensusScore } from './types';

const trimToLength = (value: string, maxLength: number): string => {
  const normalized = value.trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}...`;
};

const scorePercent = (value: number): string => `${Math.round(value * 100)}%`;

export interface PersistBoardroomConclusionResult {
  conclusionText: string;
  activityEvents: ActivityEvent[];
  knowledgeIngestion: IngestKnowledgeResult;
}

const buildConclusionText = (input: {
  session: BoardroomSession;
  consensus: ConsensusScore;
  arguments: ReadonlyArray<Argument>;
}): string => {
  const topClaims = [...input.arguments]
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 4)
    .map((argument, index) => {
      const evidence = argument.supportingEvidence.slice(0, 2).join('; ') || 'No explicit evidence';
      return `${index + 1}. ${argument.memberName} (${argument.position}, ${scorePercent(
        argument.confidence
      )}): ${trimToLength(argument.claim, 180)} [evidence: ${trimToLength(evidence, 140)}]`;
    })
    .join('\n');

  const convergence = input.consensus.convergenceZones.slice(0, 4).join('; ') || 'none';
  const tensions = input.consensus.unresolvedTensions.slice(0, 3).join('; ') || 'none';

  return [
    `Boardroom session: ${input.session.id}`,
    `Council: ${input.session.councilId}`,
    `Framing prompt: ${input.session.framingPrompt}`,
    `Consensus score: ${scorePercent(input.consensus.score)} (raw ${scorePercent(
      input.consensus.rawAlignment
    )})`,
    `Convergence zones: ${convergence}`,
    `Unresolved tensions: ${tensions}`,
    'Top argument highlights:',
    topClaims || 'No arguments were captured.',
  ].join('\n');
};

export const persistBoardroomConclusion = (
  input: {
    userId: string;
    session: BoardroomSession;
    consensus: ConsensusScore;
    arguments: ReadonlyArray<Argument>;
    threadId?: string;
    nowIso?: string;
  },
  dependencies: {
    activityStore?: ActivityStore;
    knowledgeStore?: KnowledgeGraphStore;
  } = {}
): PersistBoardroomConclusionResult => {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const conclusionText = buildConclusionText({
    session: input.session,
    consensus: input.consensus,
    arguments: input.arguments,
  });

  const completedEvent = emitActivityEvent(
    {
      userId: input.userId,
      category: 'decision',
      eventType: 'boardroom.session_completed',
      title: 'Boardroom session completed',
      description: `Consensus ${scorePercent(input.consensus.score)} on "${trimToLength(
        input.session.framingPrompt,
        120
      )}".`,
      createdAtIso: nowIso,
      threadId: input.threadId,
      metadata: {
        council_id: input.session.councilId,
        consensus_score: Number(input.consensus.score.toFixed(4)),
      },
    },
    dependencies.activityStore ?? activityStore
  );

  const knowledgeIngestion = ingestKnowledgeNote(
    {
      userId: input.userId,
      title: `Boardroom Conclusion: ${trimToLength(input.session.framingPrompt, 72)}`,
      text: conclusionText,
      nowIso,
      tags: ['boardroom', 'decision', `council:${input.session.councilId}`],
    },
    dependencies.knowledgeStore ?? knowledgeGraphStore
  );

  const knowledgeEvent = emitActivityEvent(
    {
      userId: input.userId,
      category: 'knowledge',
      eventType: 'boardroom.conclusion_ingested',
      title: 'Boardroom conclusion ingested',
      description: `Conclusion added to knowledge graph as ${knowledgeIngestion.source.id}.`,
      createdAtIso: nowIso,
      threadId: input.threadId,
      metadata: {
        source_id: knowledgeIngestion.source.id,
      },
    },
    dependencies.activityStore ?? activityStore
  );

  return {
    conclusionText,
    activityEvents: [completedEvent, knowledgeEvent],
    knowledgeIngestion,
  };
};
