import { describe, expect, it } from 'vitest';
import { ApiCircuitBreaker, CircuitBreakerOpenError } from '../circuitBreaker';

describe('api circuit breaker', () => {
  it('opens after threshold failures and fast-fails subsequent calls', async () => {
    let nowMs = Date.parse('2026-02-18T10:00:00.000Z');
    const breaker = new ApiCircuitBreaker({
      failureThreshold: 5,
      cooldownMs: 1000,
      now: () => nowMs,
    });

    for (let index = 0; index < 5; index += 1) {
      await expect(
        breaker.execute('pipeline.orchestrator', async () => {
          throw new Error('upstream timeout');
        })
      ).rejects.toThrow('upstream timeout');
    }

    const state = breaker.getState('pipeline.orchestrator');
    expect(state.status).toBe('open');
    expect(state.failureCount).toBe(5);

    let called = false;
    await expect(
      breaker.execute('pipeline.orchestrator', async () => {
        called = true;
        return 'ok';
      })
    ).rejects.toBeInstanceOf(CircuitBreakerOpenError);
    expect(called).toBe(false);
  });

  it('transitions to half-open after cooldown and closes on success', async () => {
    let nowMs = Date.parse('2026-02-18T11:00:00.000Z');
    const breaker = new ApiCircuitBreaker({
      failureThreshold: 5,
      cooldownMs: 1000,
      successThreshold: 1,
      now: () => nowMs,
    });

    for (let index = 0; index < 5; index += 1) {
      await expect(
        breaker.execute('knowledge.ingest.url', async () => {
          throw new Error('503');
        })
      ).rejects.toThrow('503');
    }

    expect(breaker.getState('knowledge.ingest.url').status).toBe('open');

    nowMs += 1001;
    const response = await breaker.execute('knowledge.ingest.url', async () => 'recovered');
    expect(response).toBe('recovered');

    const recovered = breaker.getState('knowledge.ingest.url');
    expect(recovered.status).toBe('closed');
    expect(recovered.failureCount).toBe(0);
  });
});
