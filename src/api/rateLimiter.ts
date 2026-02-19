import type { ApiMiddleware } from './gateway';
import type { ApiResponse } from './types';

const MINUTE_MS = 60_000;

interface TokenBucket {
  keyId: string;
  tokens: number;
  updatedAtMs: number;
  consumedTotal: number;
  consumedThisMinute: number;
  minuteWindowStartedAtMs: number;
  lastRequestAtIso?: string;
  historyByMinute: Map<string, number>;
}

export interface ApiRateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  resetAtIso: string;
  consumedThisMinute: number;
}

export interface ApiRateLimitUsagePoint {
  minuteIso: string;
  requestCount: number;
}

export interface ApiRateLimitUsageSummary {
  keyId: string;
  limitPerMinute: number;
  remaining: number;
  consumedThisMinute: number;
  consumedTotal: number;
  lastRequestAtIso?: string;
  recentUsage: ApiRateLimitUsagePoint[];
}

export interface ApiRateLimiterOptions {
  limitPerMinute?: number;
  maxTrackedMinutes?: number;
}

const toMinuteIso = (timestampMs: number): string => {
  const date = new Date(timestampMs);
  date.setSeconds(0, 0);
  return date.toISOString();
};

export class ApiRateLimiter {
  private readonly limitPerMinute: number;
  private readonly maxTrackedMinutes: number;
  private readonly buckets = new Map<string, TokenBucket>();

  constructor(options: ApiRateLimiterOptions = {}) {
    this.limitPerMinute = Math.max(1, Math.trunc(options.limitPerMinute ?? 120));
    this.maxTrackedMinutes = Math.max(30, Math.trunc(options.maxTrackedMinutes ?? 720));
  }

  consume(keyId: string, nowMs = Date.now()): ApiRateLimitDecision {
    const bucket = this.loadBucket(keyId, nowMs);
    this.refill(bucket, nowMs);
    this.rollMinuteWindow(bucket, nowMs);

    if (bucket.tokens < 1) {
      const secondsUntilToken = Math.ceil((60 / this.limitPerMinute) * 1);
      return {
        allowed: false,
        limit: this.limitPerMinute,
        remaining: 0,
        retryAfterSeconds: Math.max(1, secondsUntilToken),
        resetAtIso: new Date(nowMs + secondsUntilToken * 1000).toISOString(),
        consumedThisMinute: bucket.consumedThisMinute,
      };
    }

    bucket.tokens -= 1;
    bucket.consumedThisMinute += 1;
    bucket.consumedTotal += 1;
    bucket.lastRequestAtIso = new Date(nowMs).toISOString();

    const minuteIso = toMinuteIso(nowMs);
    const previousCount = bucket.historyByMinute.get(minuteIso) ?? 0;
    bucket.historyByMinute.set(minuteIso, previousCount + 1);
    this.pruneHistory(bucket);

    return {
      allowed: true,
      limit: this.limitPerMinute,
      remaining: Math.max(0, Math.floor(bucket.tokens)),
      retryAfterSeconds: 0,
      resetAtIso: new Date(bucket.minuteWindowStartedAtMs + MINUTE_MS).toISOString(),
      consumedThisMinute: bucket.consumedThisMinute,
    };
  }

  inspect(keyId: string, nowMs = Date.now()): ApiRateLimitUsageSummary {
    const bucket = this.loadBucket(keyId, nowMs);
    this.refill(bucket, nowMs);
    this.rollMinuteWindow(bucket, nowMs);

    const recentUsage = Array.from(bucket.historyByMinute.entries())
      .map(([minuteIso, requestCount]) => ({ minuteIso, requestCount }))
      .sort((left, right) => Date.parse(left.minuteIso) - Date.parse(right.minuteIso));

    return {
      keyId,
      limitPerMinute: this.limitPerMinute,
      remaining: Math.max(0, Math.floor(bucket.tokens)),
      consumedThisMinute: bucket.consumedThisMinute,
      consumedTotal: bucket.consumedTotal,
      lastRequestAtIso: bucket.lastRequestAtIso,
      recentUsage,
    };
  }

  resetForTests(): void {
    this.buckets.clear();
  }

  private loadBucket(keyId: string, nowMs: number): TokenBucket {
    const existing = this.buckets.get(keyId);
    if (existing) return existing;

    const created: TokenBucket = {
      keyId,
      tokens: this.limitPerMinute,
      updatedAtMs: nowMs,
      consumedTotal: 0,
      consumedThisMinute: 0,
      minuteWindowStartedAtMs: nowMs,
      historyByMinute: new Map<string, number>(),
    };

    this.buckets.set(keyId, created);
    return created;
  }

  private refill(bucket: TokenBucket, nowMs: number): void {
    const elapsedMs = Math.max(0, nowMs - bucket.updatedAtMs);
    const refillRatePerMs = this.limitPerMinute / MINUTE_MS;
    bucket.tokens = Math.min(this.limitPerMinute, bucket.tokens + elapsedMs * refillRatePerMs);
    bucket.updatedAtMs = nowMs;
  }

  private rollMinuteWindow(bucket: TokenBucket, nowMs: number): void {
    if (nowMs - bucket.minuteWindowStartedAtMs < MINUTE_MS) return;
    bucket.minuteWindowStartedAtMs = nowMs;
    bucket.consumedThisMinute = 0;
  }

  private pruneHistory(bucket: TokenBucket): void {
    const entries = Array.from(bucket.historyByMinute.entries()).sort((left, right) =>
      left[0].localeCompare(right[0])
    );

    while (entries.length > this.maxTrackedMinutes) {
      const [minuteIso] = entries.shift() ?? [];
      if (!minuteIso) break;
      bucket.historyByMinute.delete(minuteIso);
    }
  }
}

const appendHeaders = (
  response: ApiResponse,
  decision: ApiRateLimitDecision
): ApiResponse => ({
  ...response,
  headers: {
    ...response.headers,
    'x-ratelimit-limit': String(decision.limit),
    'x-ratelimit-remaining': String(decision.remaining),
    'x-ratelimit-reset': decision.resetAtIso,
  },
});

export const createApiRateLimitMiddleware = (
  limiter: ApiRateLimiter
): ApiMiddleware => {
  return async (context, next) => {
    if (!context.routeMeta.requiresAuth || !context.principal) {
      return next();
    }

    const decision = limiter.consume(context.principal.keyId, Date.now());
    if (!decision.allowed) {
      return {
        status: 429,
        headers: {
          'content-type': 'application/json',
          'x-api-version': context.routeMeta.version ?? 'v1',
          'retry-after': String(decision.retryAfterSeconds),
          'x-ratelimit-limit': String(decision.limit),
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': decision.resetAtIso,
        },
        body: {
          ok: false,
          requestId: context.requestId,
          atIso: context.nowIso,
          error: {
            code: 'rate_limited',
            message: 'Rate limit exceeded for this API key.',
            details: {
              limitPerMinute: decision.limit,
              retryAfterSeconds: decision.retryAfterSeconds,
            },
          },
        },
      };
    }

    const response = await next();
    return appendHeaders(response, decision);
  };
};
