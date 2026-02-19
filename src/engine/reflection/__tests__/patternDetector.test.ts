import { describe, expect, it } from 'vitest';
import type { Message } from '../../../../types';
import { detectBehaviorPatterns } from '../patternDetector';

const mk = (id: string, role: 'user' | 'model', text: string): Message => ({
  id,
  role,
  text,
  timestamp: Date.now(),
});

describe('reflection pattern detector', () => {
  it('detects topic/emotion/relationship patterns from recent messages', () => {
    const messages: Message[] = [
      mk('1', 'user', 'I am stressed about this launch deadline and roadmap.'),
      mk('2', 'model', 'Let us simplify the scope and define one milestone.'),
      mk('3', 'user', 'Thanks, I appreciate your help with this plan.'),
      mk('4', 'user', 'Another launch scope question for this week.'),
      mk('5', 'model', 'Great, we can keep the plan concrete and focused.'),
    ];

    const patterns = detectBehaviorPatterns(messages);
    expect(patterns.length).toBeGreaterThanOrEqual(2);
    expect(patterns.some((pattern) => pattern.kind === 'topic')).toBe(true);
  });
});
