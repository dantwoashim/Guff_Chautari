import type { Message } from '../../types';
import type { DecisionEvidence, DecisionEvidenceInput } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

const toIso = (value: number | string | Date): string => {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number') {
    const ms = value > 10_000_000_000 ? value : value * 1000;
    return new Date(ms).toISOString();
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? new Date().toISOString() : new Date(parsed).toISOString();
};

const recencyScore = (timestampIso: string, nowIso: string): number => {
  const ageDays = Math.max(0, (Date.parse(nowIso) - Date.parse(timestampIso)) / DAY_MS);
  return Math.max(0, Math.min(1, 1 / (1 + ageDays / 14)));
};

const historyToEvidence = (messages: ReadonlyArray<Message>, nowIso: string): DecisionEvidence[] => {
  return messages
    .filter((message) => message.text.trim().length > 0)
    .slice(-15)
    .map((message) => {
      const timestampIso = toIso(message.timestamp);
      return {
        id: `history-${message.id}`,
        type: 'history',
        content: message.text,
        score: recencyScore(timestampIso, nowIso) * 0.8,
        timestamp_iso: timestampIso,
        source_id: message.id,
        provenance_message_ids: [message.id],
      } satisfies DecisionEvidence;
    });
};

export const buildDecisionEvidence = (input: DecisionEvidenceInput): DecisionEvidence[] => {
  const nowIso = input.now_iso ?? new Date().toISOString();
  const limit = Math.max(1, input.limit ?? 12);

  const memoryEvidence = input.memories.map((memory) => {
    const timestampIso = toIso(memory.timestampIso ?? memory.timestamp);
    const weightedScore = memory.score * 0.7 + recencyScore(timestampIso, nowIso) * 0.3;

    return {
      id: `memory-${memory.id}`,
      type: 'memory',
      content: memory.content,
      score: weightedScore,
      timestamp_iso: timestampIso,
      source_id: memory.id,
      provenance_message_ids: memory.provenanceMessageIds ? [...memory.provenanceMessageIds] : [],
    } satisfies DecisionEvidence;
  });

  const historyEvidence = historyToEvidence(input.history, nowIso);

  return [...memoryEvidence, ...historyEvidence]
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return Date.parse(right.timestamp_iso) - Date.parse(left.timestamp_iso);
    })
    .slice(0, limit);
};

export const evidenceByType = (
  evidence: ReadonlyArray<DecisionEvidence>
): Record<'memory' | 'history' | 'knowledge', DecisionEvidence[]> => {
  return {
    memory: evidence.filter((entry) => entry.type === 'memory'),
    history: evidence.filter((entry) => entry.type === 'history'),
    knowledge: evidence.filter((entry) => entry.type === 'knowledge'),
  };
};
