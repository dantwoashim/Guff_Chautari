import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Message } from '../../types';
import { createHumanResponsePlan, streamHumanResponse } from '../humanResponseService';

describe('humanResponseService', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('creates a human response plan with chunk/timing metadata', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.2);
    const recent: Message[] = [
      { id: 'u1', role: 'user', text: 'idk if this will work', timestamp: Date.now() - 1000 },
      { id: 'u2', role: 'user', text: 'i feel stressed about exams', timestamp: Date.now() },
    ];

    const plan = createHumanResponsePlan(
      'I hear you. Let us break it into smaller steps and tackle one piece first.',
      42,
      recent,
      12,
      Date.now() - 1000 * 60 * 60 * 24
    );

    expect(plan.messages.length).toBeGreaterThan(0);
    expect(plan.messages[0].text.length).toBeGreaterThan(0);
    expect(plan.messages[0].typingDuration).toBeGreaterThan(0);
  });

  it('streams plan messages in order', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const plan = {
      timeContext: { hour: 12, period: 'afternoon', dayType: 'weekday' as const, isWeekend: false },
      messages: [
        {
          id: 'm1',
          text: 'first',
          typingDuration: 10,
          delayBefore: 0,
          isChunked: false,
          chunkIndex: 0,
          totalChunks: 2,
        },
        {
          id: 'm2',
          text: 'second',
          typingDuration: 10,
          delayBefore: 5,
          isChunked: false,
          chunkIndex: 1,
          totalChunks: 2,
        },
      ],
    };

    const out: string[] = [];
    const generator = streamHumanResponse(plan);

    const first = generator.next();
    await vi.advanceTimersByTimeAsync(610);
    out.push((await first).value.text);

    const second = generator.next();
    await vi.advanceTimersByTimeAsync(20);
    out.push((await second).value.text);

    expect(out).toEqual(['first', 'second']);
  });
});
