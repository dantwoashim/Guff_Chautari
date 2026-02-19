import {
  appendDecisionEvidence,
  type DecisionEvidence,
  type DecisionEvidenceStore,
  type DecisionMatrix,
} from '../decision';
import type { Argument, BoardroomSession, ConsensusScore } from './types';

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

const trimToLength = (value: string, maxLength: number): string => {
  const normalized = value.trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}...`;
};

const scorePercent = (value: number): string => `${Math.round(value * 100)}%`;

export const buildBoardroomFramingFromDecision = (matrix: DecisionMatrix): string => {
  const options = matrix.options
    .map((option, index) => `${index + 1}. ${option.title} - ${option.description}`)
    .join('\n');
  const assumptions = matrix.assumptions
    .sort((left, right) => left.confidence - right.confidence)
    .slice(0, 4)
    .map((assumption) => `- ${assumption.id} (${Math.round(assumption.confidence * 100)}%): ${assumption.text}`)
    .join('\n');

  return [
    `Decision question: ${matrix.question}`,
    'Debate objective: challenge assumptions and identify the highest-confidence path.',
    'Options under review:',
    options,
    assumptions.length > 0 ? 'Lowest-confidence assumptions to stress-test:' : '',
    assumptions,
    'Output requirement: each member must take a position with evidence and confidence.',
  ]
    .filter((line) => line.length > 0)
    .join('\n');
};

export const createBoardroomSessionFromDecision = (input: {
  userId: string;
  councilId: string;
  matrix: DecisionMatrix;
  roundCount?: number;
  mode?: BoardroomSession['mode'];
  limits?: Partial<BoardroomSession['limits']>;
  nowIso?: string;
}): BoardroomSession => {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const roundCount = Math.max(1, input.roundCount ?? 2);

  return {
    id: makeId('boardroom-session'),
    userId: input.userId,
    councilId: input.councilId,
    framingPrompt: buildBoardroomFramingFromDecision(input.matrix),
    mode: input.mode ?? 'round_robin',
    roundCount,
    limits: {
      maxTokensPerTurn: Math.max(120, input.limits?.maxTokensPerTurn ?? 320),
      maxDurationMsPerTurn: Math.max(1_000, input.limits?.maxDurationMsPerTurn ?? 6_000),
    },
    status: 'running',
    startedAtIso: nowIso,
  };
};

const summarizeTopClaims = (argumentsLog: ReadonlyArray<Argument>): string => {
  return [...argumentsLog]
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 3)
    .map((argument) => `${argument.memberName}: ${trimToLength(argument.claim, 140)}`)
    .join(' | ');
};

export const buildDecisionEvidenceFromBoardroom = (input: {
  matrixId: string;
  session: BoardroomSession;
  consensus: ConsensusScore;
  arguments: ReadonlyArray<Argument>;
  nowIso?: string;
}): DecisionEvidence => {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const convergence = input.consensus.convergenceZones.slice(0, 3).join('; ') || 'none';
  const tensions = input.consensus.unresolvedTensions.slice(0, 2).join('; ') || 'none';
  const topClaims = summarizeTopClaims(input.arguments);

  return {
    id: makeId('decision-evidence-boardroom'),
    type: 'knowledge',
    content:
      `Boardroom consensus for session ${input.session.id}: ` +
      `score ${scorePercent(input.consensus.score)} (raw ${scorePercent(input.consensus.rawAlignment)}). ` +
      `Convergence: ${convergence}. Unresolved tensions: ${tensions}. Top claims: ${topClaims}.`,
    score: Number((input.consensus.score * 0.85 + 0.1).toFixed(4)),
    timestamp_iso: nowIso,
    source_id: input.session.id,
    provenance_message_ids: input.arguments.slice(0, 8).map((argument) => argument.id),
  };
};

export const exportBoardroomConsensusToDecisionEvidence = (
  input: {
    userId: string;
    matrixId: string;
    session: BoardroomSession;
    consensus: ConsensusScore;
    arguments: ReadonlyArray<Argument>;
    nowIso?: string;
  },
  store?: DecisionEvidenceStore
): DecisionEvidence => {
  const evidence = buildDecisionEvidenceFromBoardroom({
    matrixId: input.matrixId,
    session: input.session,
    consensus: input.consensus,
    arguments: input.arguments,
    nowIso: input.nowIso,
  });

  appendDecisionEvidence(
    {
      userId: input.userId,
      matrixId: input.matrixId,
      evidence,
    },
    store
  );

  return evidence;
};
