import type { Message } from '../../types';
import { createInitialRelationshipState, updateRelationshipState } from '@ashim/engine';
import type { RelationshipTimeline, RelationshipTimelineEntry } from './types';

const conflictSignals = ['argue', 'conflict', 'angry', 'upset', 'frustrated', 'hurt'];
const positiveSignals = ['thanks', 'appreciate', 'grateful', 'great', 'love', 'helpful'];

const containsAny = (text: string, terms: ReadonlyArray<string>): boolean => {
  const lowered = text.toLowerCase();
  return terms.some((term) => lowered.includes(term));
};

const scorePositives = (text: string): number => {
  const lowered = text.toLowerCase();
  return positiveSignals.reduce((count, term) => count + (lowered.includes(term) ? 1 : 0), 0);
};

const scoreNegatives = (text: string): number => {
  const lowered = text.toLowerCase();
  return conflictSignals.reduce((count, term) => count + (lowered.includes(term) ? 1 : 0), 0);
};

const reasonForEntry = (stage: string, conflict: boolean): string => {
  if (conflict) {
    return `Conflict markers observed, stage adjusted to ${stage}.`;
  }
  return `Relationship continuity advanced or stabilized at ${stage}.`;
};

export const buildRelationshipTimeline = (payload: {
  personaId: string;
  messages: ReadonlyArray<Message>;
}): RelationshipTimeline => {
  const sorted = [...payload.messages].sort((left, right) => left.timestamp - right.timestamp);
  let state = createInitialRelationshipState('secure');
  const entries: RelationshipTimelineEntry[] = [];

  for (let index = 0; index < sorted.length; index += 1) {
    const message = sorted[index];
    const positiveSignalsCount = scorePositives(message.text);
    const negativeSignalsCount = scoreNegatives(message.text);
    const conflict = containsAny(message.text, conflictSignals);

    state = updateRelationshipState(state, {
      positiveSignals: positiveSignalsCount,
      negativeSignals: negativeSignalsCount,
      conflictTriggered: conflict,
      silenceHours: index === 0 ? 0 : Math.max(0, (message.timestamp - sorted[index - 1].timestamp) / (60 * 60 * 1000)),
      daysElapsed: index === 0 ? 0 : Math.max(0, (message.timestamp - sorted[index - 1].timestamp) / (24 * 60 * 60 * 1000)),
    });

    const shouldRecord =
      index === sorted.length - 1 ||
      index % 5 === 0 ||
      (entries.length > 0 && entries[entries.length - 1].stage !== state.stage);

    if (!shouldRecord) continue;

    entries.push({
      timestampIso: new Date(message.timestamp).toISOString(),
      stage: state.stage,
      trustScore: Number(state.trustScore.toFixed(3)),
      unresolvedConflict: state.unresolvedConflict,
      reason: reasonForEntry(state.stage, conflict),
    });
  }

  if (entries.length === 0) {
    entries.push({
      timestampIso: new Date().toISOString(),
      stage: state.stage,
      trustScore: Number(state.trustScore.toFixed(3)),
      unresolvedConflict: state.unresolvedConflict,
      reason: 'Insufficient interactions to infer a richer timeline.',
    });
  }

  return {
    personaId: payload.personaId,
    entries,
    currentStage: entries[entries.length - 1].stage,
  };
};
