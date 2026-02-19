import type { BeliefChange } from './types';

export interface BeliefDetectorMessage {
  id: string;
  text: string;
  timestamp: number;
  threadId?: string;
}

export interface BeliefDetectorDecision {
  id: string;
  question: string;
  selectedOptionId?: string;
  selectedOptionTitle?: string;
  createdAtIso: string;
  rationale?: string;
}

export interface BeliefDetectorCounterfactualQuery {
  id: string;
  rawQuery: string;
  createdAtIso: string;
}

interface BeliefDetectorInput {
  userId: string;
  messages?: ReadonlyArray<BeliefDetectorMessage>;
  decisions?: ReadonlyArray<BeliefDetectorDecision>;
  counterfactualQueries?: ReadonlyArray<BeliefDetectorCounterfactualQuery>;
  minimumConfidence?: number;
}

interface BeliefSignal {
  topic: string;
  stance: string;
  atIso: string;
  triggerEventId: string;
  triggerEventType: string;
  confidence: number;
}

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

const toMs = (iso: string): number => {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const normalize = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const isDifferentStance = (left: string, right: string): boolean => {
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return false;
  if (a === b) return false;
  if (a.includes(b) || b.includes(a)) return false;
  return true;
};

const inferTopicFromText = (text: string): string => {
  const lowered = normalize(text);

  if (/contractor|freelancer|agency|in house|in-house|build internally|internal team|outsource/.test(lowered)) {
    return 'resourcing strategy';
  }

  if (/retention|churn|activation|engagement/.test(lowered)) {
    return 'user retention';
  }

  if (/pricing|price|revenue/.test(lowered)) {
    return 'pricing strategy';
  }

  const aboutMatch = lowered.match(/(?:about|for|on)\s+([a-z0-9\s-]{3,60})/i);
  if (aboutMatch?.[1]) return aboutMatch[1].trim();

  return lowered.split(' ').filter((token) => token.length > 3).slice(0, 4).join(' ') || 'general';
};

const inferStanceFromText = (text: string): string => {
  const lowered = normalize(text);

  if (/contractor|freelancer|agency|outsource/.test(lowered)) {
    return 'hire contractor';
  }

  if (/in house|in-house|build internally|internal team|ourselves/.test(lowered)) {
    return 'build in-house';
  }

  if (/priorit|focus|care\s+about/.test(lowered) && /retention|churn/.test(lowered)) {
    return 'prioritize user retention';
  }

  if (/depriorit|ignore|not\s+focus/.test(lowered) && /retention|churn/.test(lowered)) {
    return 'deprioritize user retention';
  }

  const thinkMatch = lowered.match(/(?:i\s+(?:think|believe|feel|decided)\s+)(.+)$/i);
  if (thinkMatch?.[1]) {
    return thinkMatch[1].trim().slice(0, 120);
  }

  return lowered.slice(0, 120);
};

const extractFromMessages = (messages: ReadonlyArray<BeliefDetectorMessage>): BeliefSignal[] => {
  const beliefRegex =
    /(i\s+(?:think|believe|feel|realized|decided)|we\s+(?:should|need to|must)|i\s+care\s+about|we\s+care\s+about)/i;

  return messages
    .filter((message) => beliefRegex.test(message.text))
    .map((message) => ({
      topic: inferTopicFromText(message.text),
      stance: inferStanceFromText(message.text),
      atIso: new Date(message.timestamp).toISOString(),
      triggerEventId: message.id,
      triggerEventType: 'conversation',
      confidence: 0.7,
    }));
};

const extractFromDecisions = (decisions: ReadonlyArray<BeliefDetectorDecision>): BeliefSignal[] => {
  return decisions
    .map((decision) => {
      const text = `${decision.question} ${decision.selectedOptionTitle ?? ''} ${decision.rationale ?? ''}`.trim();
      if (!text) return null;
      return {
        topic: inferTopicFromText(text),
        stance: inferStanceFromText(text),
        atIso: decision.createdAtIso,
        triggerEventId: decision.id,
        triggerEventType: 'decision',
        confidence: 0.64,
      } satisfies BeliefSignal;
    })
    .filter((signal): signal is BeliefSignal => signal !== null);
};

const extractFromCounterfactual = (
  queries: ReadonlyArray<BeliefDetectorCounterfactualQuery>
): BeliefSignal[] => {
  return queries
    .map((query) => {
      const lowered = normalize(query.rawQuery);
      if (!lowered.includes('what if') && !lowered.includes('changed my mind')) return null;

      return {
        topic: inferTopicFromText(query.rawQuery),
        stance: inferStanceFromText(query.rawQuery),
        atIso: query.createdAtIso,
        triggerEventId: query.id,
        triggerEventType: 'counterfactual',
        confidence: 0.58,
      } satisfies BeliefSignal;
    })
    .filter((signal): signal is BeliefSignal => signal !== null);
};

export const detectBeliefChanges = (payload: BeliefDetectorInput): BeliefChange[] => {
  const minimumConfidence = clamp(payload.minimumConfidence ?? 0.55, 0, 1);

  const signals = [
    ...extractFromMessages(payload.messages ?? []),
    ...extractFromDecisions(payload.decisions ?? []),
    ...extractFromCounterfactual(payload.counterfactualQueries ?? []),
  ]
    .sort((left, right) => toMs(left.atIso) - toMs(right.atIso));

  const lastByTopic = new Map<string, BeliefSignal>();
  const changes: BeliefChange[] = [];

  for (const signal of signals) {
    const topicKey = normalize(signal.topic);
    if (!topicKey) continue;

    const previous = lastByTopic.get(topicKey);
    if (!previous) {
      lastByTopic.set(topicKey, signal);
      continue;
    }

    if (!isDifferentStance(previous.stance, signal.stance)) {
      if (signal.confidence > previous.confidence) {
        lastByTopic.set(topicKey, signal);
      }
      continue;
    }

    const confidence = clamp((previous.confidence + signal.confidence) / 2 + 0.08, 0, 1);
    if (confidence < minimumConfidence) {
      lastByTopic.set(topicKey, signal);
      continue;
    }

    changes.push({
      id: makeId('belief-change'),
      userId: payload.userId,
      topic: signal.topic,
      oldStance: previous.stance,
      newStance: signal.stance,
      changedAtIso: signal.atIso,
      triggerEventId: signal.triggerEventId,
      triggerEventType: signal.triggerEventType,
      confidence: Number(confidence.toFixed(3)),
      evidenceSnapshotIds: [previous.triggerEventId, signal.triggerEventId],
    });

    lastByTopic.set(topicKey, signal);
  }

  return changes.sort((left, right) => toMs(left.changedAtIso) - toMs(right.changedAtIso));
};
