import type { Message } from '../../types';
import type { EmotionalTrend, EmotionalTrendPoint } from './types';

const POSITIVE_TERMS = ['happy', 'great', 'love', 'grateful', 'excited', 'calm', 'wins', 'proud'];
const NEGATIVE_TERMS = ['stress', 'stressed', 'anxious', 'panic', 'burnout', 'overwhelmed', 'worried', 'sad'];
const HIGH_AROUSAL_TERMS = ['urgent', 'asap', 'now', 'immediately', '!!!'];

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const toDateKey = (timestamp: number): string => {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
};

const scoreMessageValence = (text: string): number => {
  const lowered = text.toLowerCase();
  const positiveCount = POSITIVE_TERMS.reduce(
    (count, term) => count + (lowered.includes(term) ? 1 : 0),
    0
  );
  const negativeCount = NEGATIVE_TERMS.reduce(
    (count, term) => count + (lowered.includes(term) ? 1 : 0),
    0
  );

  const raw = 0.5 + (positiveCount - negativeCount) * 0.12;
  return Number(clamp(raw, 0, 1).toFixed(3));
};

const scoreMessageArousal = (text: string): number => {
  const lowered = text.toLowerCase();
  const punctuationBoost = (text.match(/[!?]/g)?.length ?? 0) * 0.05;
  const keywordBoost = HIGH_AROUSAL_TERMS.reduce(
    (count, term) => count + (lowered.includes(term) ? 1 : 0),
    0
  );

  return Number(clamp(0.25 + punctuationBoost + keywordBoost * 0.15, 0, 1).toFixed(3));
};

const dayLabel = (iso: string): string => {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
};

const average = (values: ReadonlyArray<number>): number => {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const normalizeWindowStart = (nowIso: string, windowDays: number): number => {
  const nowMs = Date.parse(nowIso);
  return nowMs - windowDays * 24 * 60 * 60 * 1000;
};

export const buildEmotionalTrend = (payload: {
  personaId: string;
  messages: ReadonlyArray<Message>;
  windowDays?: number;
  nowIso?: string;
}): EmotionalTrend => {
  const windowDays = Math.max(7, Math.min(90, payload.windowDays ?? 30));
  const nowIso = payload.nowIso ?? new Date().toISOString();
  const windowStartMs = normalizeWindowStart(nowIso, windowDays);

  const grouped = new Map<string, { valence: number[]; arousal: number[]; count: number }>();

  for (const message of payload.messages) {
    const timestamp = message.timestamp;
    if (timestamp < windowStartMs) continue;

    const key = toDateKey(timestamp);
    const entry = grouped.get(key) ?? { valence: [], arousal: [], count: 0 };
    entry.valence.push(scoreMessageValence(message.text));
    entry.arousal.push(scoreMessageArousal(message.text));
    entry.count += 1;
    grouped.set(key, entry);
  }

  const points: EmotionalTrendPoint[] = Array.from(grouped.entries())
    .sort((left, right) => Date.parse(left[0]) - Date.parse(right[0]))
    .map(([dateIso, entry]) => ({
      dateIso,
      dayLabel: dayLabel(dateIso),
      valence: Number(average(entry.valence).toFixed(3)),
      arousal: Number(average(entry.arousal).toFixed(3)),
      messageCount: entry.count,
    }));

  return {
    personaId: payload.personaId,
    windowDays,
    averageValence: Number(average(points.map((point) => point.valence)).toFixed(3)),
    averageArousal: Number(average(points.map((point) => point.arousal)).toFixed(3)),
    points,
  };
};
