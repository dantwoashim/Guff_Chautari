import type { Message } from '../../../types';
import type { BehaviorPattern } from './types';

const STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'that',
  'with',
  'this',
  'have',
  'from',
  'your',
  'just',
  'about',
  'there',
  'what',
  'when',
  'they',
  'will',
]);

const tokenize = (value: string): string[] => {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4)
    .filter((token) => !STOPWORDS.has(token));
};

const toTrend = (earlyCount: number, lateCount: number): BehaviorPattern['trend'] => {
  if (lateCount > earlyCount) return 'rising';
  if (lateCount < earlyCount) return 'falling';
  return 'stable';
};

const countContains = (messages: ReadonlyArray<Message>, terms: readonly string[]): number => {
  return messages.reduce((count, message) => {
    const text = message.text.toLowerCase();
    const hit = terms.some((term) => text.includes(term));
    return count + (hit ? 1 : 0);
  }, 0);
};

export const detectBehaviorPatterns = (messages: ReadonlyArray<Message>): BehaviorPattern[] => {
  if (messages.length === 0) return [];

  const recent = messages.slice(-40);
  const midpoint = Math.max(1, Math.floor(recent.length / 2));
  const early = recent.slice(0, midpoint);
  const late = recent.slice(midpoint);

  const topicCounts = new Map<string, number>();
  for (const message of recent) {
    const tokens = tokenize(message.text);
    for (const token of tokens) {
      topicCounts.set(token, (topicCounts.get(token) ?? 0) + 1);
    }
  }

  const topTopic = [...topicCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 2)
    .map(([term, count], index) => ({
      id: `pattern-topic-${index}-${term}`,
      kind: 'topic' as const,
      label: `Frequent topic: ${term}`,
      occurrences: count,
      trend: toTrend(
        countContains(early, [term]),
        countContains(late, [term])
      ),
    }));

  const stressTerms = ['stressed', 'overwhelmed', 'anxious', 'panic', 'burnout'];
  const warmthTerms = ['thanks', 'appreciate', 'love', 'grateful', 'proud'];
  const planningTerms = ['plan', 'roadmap', 'deadline', 'launch', 'scope'];

  const stressCount = countContains(recent, stressTerms);
  const warmthCount = countContains(recent, warmthTerms);
  const planningCount = countContains(recent, planningTerms);

  const patterns: BehaviorPattern[] = [...topTopic];

  if (stressCount > 0) {
    patterns.push({
      id: 'pattern-emotion-stress',
      kind: 'emotion',
      label: 'Stress cues appeared repeatedly',
      occurrences: stressCount,
      trend: toTrend(countContains(early, stressTerms), countContains(late, stressTerms)),
    });
  }

  if (warmthCount > 0) {
    patterns.push({
      id: 'pattern-relationship-warmth',
      kind: 'relationship',
      label: 'Relationship warmth signals increased',
      occurrences: warmthCount,
      trend: toTrend(countContains(early, warmthTerms), countContains(late, warmthTerms)),
    });
  }

  if (planningCount > 0) {
    patterns.push({
      id: 'pattern-linguistic-planning',
      kind: 'linguistic',
      label: 'Execution-focused language is recurrent',
      occurrences: planningCount,
      trend: toTrend(countContains(early, planningTerms), countContains(late, planningTerms)),
    });
  }

  return patterns.slice(0, 6);
};
