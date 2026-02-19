import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createTypingController,
  generateTypingSequence,
  getStateAtTime,
} from '../typingSimulator';

describe('typingSimulator', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('generates a sequence that starts with reading and ends with done', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const sequence = generateTypingSequence(120, 80, 'normal');

    expect(sequence.states[0].phase).toBe('reading');
    expect(sequence.states[sequence.states.length - 1].phase).toBe('done');
    expect(sequence.totalDuration).toBeGreaterThan(0);
  });

  it('returns the latest typing state at a time point', () => {
    const sequence = {
      totalDuration: 3000,
      states: [
        {
          isTyping: false,
          intensity: 'light' as const,
          phase: 'reading' as const,
          startedAt: 0,
          estimatedEnd: 500,
        },
        {
          isTyping: true,
          intensity: 'normal' as const,
          phase: 'typing' as const,
          startedAt: 500,
          estimatedEnd: 2500,
        },
      ],
    };

    const state = getStateAtTime(sequence, 1000);
    expect(state?.phase).toBe('typing');
  });

  it('plays typing states through the controller', () => {
    vi.useFakeTimers();
    const onStateChange = vi.fn();
    const controller = createTypingController(
      {
        totalDuration: 20,
        states: [
          {
            isTyping: false,
            intensity: 'light',
            phase: 'reading',
            startedAt: 0,
            estimatedEnd: 10,
          },
          {
            isTyping: true,
            intensity: 'normal',
            phase: 'typing',
            startedAt: 10,
            estimatedEnd: 20,
          },
        ],
      },
      onStateChange
    );

    controller.start();
    vi.advanceTimersByTime(25);

    expect(onStateChange).toHaveBeenCalledTimes(2);
    expect(onStateChange.mock.calls[0][0].phase).toBe('reading');
    expect(onStateChange.mock.calls[1][0].phase).toBe('typing');
  });
});
