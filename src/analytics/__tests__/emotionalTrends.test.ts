import { describe, expect, it } from 'vitest';
import type { Message } from '../../../types';
import { buildEmotionalTrend } from '../emotionalTrends';
import { detectEmotionalPatterns } from '../patternDetector';

const buildMessage = (id: string, text: string, iso: string): Message => ({
  id,
  role: 'user',
  text,
  timestamp: Date.parse(iso),
});

describe('emotional trends', () => {
  it('builds trend points and detects weekly pattern signals', () => {
    const messages: Message[] = [
      buildMessage('m1', 'I feel stressed and overwhelmed this Monday.', '2026-10-05T09:00:00.000Z'),
      buildMessage('m2', 'This week is urgent and intense!', '2026-10-06T09:00:00.000Z'),
      buildMessage('m3', 'Thanks, feeling calmer now.', '2026-10-07T09:00:00.000Z'),
      buildMessage('m4', 'Great progress and grateful for the support.', '2026-10-10T09:00:00.000Z'),
      buildMessage('m5', 'Weekend feels calm and happy.', '2026-10-11T09:00:00.000Z'),
      buildMessage('m6', 'Next Monday I am anxious again.', '2026-10-12T09:00:00.000Z'),
    ];

    const trend = buildEmotionalTrend({
      personaId: 'persona-1',
      messages,
      nowIso: '2026-10-13T10:00:00.000Z',
      windowDays: 30,
    });

    expect(trend.points.length).toBeGreaterThanOrEqual(5);
    expect(trend.averageValence).toBeGreaterThan(0);

    const insights = detectEmotionalPatterns(trend);
    expect(insights.length).toBeGreaterThan(0);
  });
});
