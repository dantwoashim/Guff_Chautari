import type { ApiMiddleware } from './gateway';
import type { ApiResponse } from './types';

export interface ApiAnalyticsRecord {
  requestId: string;
  routeName: string;
  method: string;
  path: string;
  status: number;
  latencyMs: number;
  atIso: string;
  workspaceId?: string | null;
  keyId?: string;
  ownerUserId?: string;
  errorCode?: string;
}

export interface ApiRouteAnalyticsSummary {
  routeName: string;
  requests: number;
  errors: number;
  errorRate: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
}

export interface ApiAnalyticsWindowSummary {
  generatedAtIso: string;
  windowMinutes: number;
  totalRequests: number;
  errorRequests: number;
  errorRate: number;
  requestsPerMinute: number;
  routes: ApiRouteAnalyticsSummary[];
}

export interface ApiAnalyticsTrackerOptions {
  maxRecords?: number;
}

const percentile = (values: number[], ratio: number): number => {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return Math.round(sorted[index]);
};

const withinWindow = (recordIso: string, nowMs: number, windowMinutes: number): boolean => {
  const ageMs = nowMs - Date.parse(recordIso);
  return ageMs >= 0 && ageMs <= windowMinutes * 60_000;
};

export class ApiAnalyticsTracker {
  private readonly maxRecords: number;
  private records: ApiAnalyticsRecord[] = [];

  constructor(options: ApiAnalyticsTrackerOptions = {}) {
    this.maxRecords = Math.max(200, Math.trunc(options.maxRecords ?? 10_000));
  }

  record(event: ApiAnalyticsRecord): void {
    this.records = [...this.records, event].slice(-this.maxRecords);
  }

  listRecent(limit = 100): ApiAnalyticsRecord[] {
    return this.records.slice(-Math.max(1, limit));
  }

  summarize(input: {
    keyId?: string;
    ownerUserId?: string;
    windowMinutes?: number;
    nowIso?: string;
  }): ApiAnalyticsWindowSummary {
    const nowMs = Date.parse(input.nowIso ?? new Date().toISOString());
    const windowMinutes = Math.max(1, Math.min(24 * 60, Math.trunc(input.windowMinutes ?? 60)));

    const scoped = this.records
      .filter((record) => {
        if (input.keyId && record.keyId !== input.keyId) return false;
        if (input.ownerUserId && record.ownerUserId !== input.ownerUserId) return false;
        return true;
      })
      .filter((record) => withinWindow(record.atIso, nowMs, windowMinutes));

    const byRoute = new Map<string, ApiAnalyticsRecord[]>();
    for (const record of scoped) {
      const list = byRoute.get(record.routeName) ?? [];
      byRoute.set(record.routeName, [...list, record]);
    }

    const routes: ApiRouteAnalyticsSummary[] = Array.from(byRoute.entries())
      .map(([routeName, records]) => {
        const errors = records.filter((record) => record.status >= 400).length;
        const latencies = records.map((record) => record.latencyMs);
        return {
          routeName,
          requests: records.length,
          errors,
          errorRate: records.length > 0 ? Number((errors / records.length).toFixed(4)) : 0,
          p50Ms: percentile(latencies, 0.5),
          p95Ms: percentile(latencies, 0.95),
          p99Ms: percentile(latencies, 0.99),
        };
      })
      .sort((left, right) => right.requests - left.requests);

    const errorRequests = scoped.filter((record) => record.status >= 400).length;

    return {
      generatedAtIso: new Date(nowMs).toISOString(),
      windowMinutes,
      totalRequests: scoped.length,
      errorRequests,
      errorRate: scoped.length > 0 ? Number((errorRequests / scoped.length).toFixed(4)) : 0,
      requestsPerMinute:
        windowMinutes > 0 ? Number((scoped.length / windowMinutes).toFixed(4)) : scoped.length,
      routes,
    };
  }

  resetForTests(): void {
    this.records = [];
  }
}

export const createApiAnalyticsMiddleware = (
  tracker: ApiAnalyticsTracker
): ApiMiddleware => {
  return async (context, next) => {
    const startedAt = Date.now();
    const response = await next();
    const latencyMs = Date.now() - startedAt;

    let errorCode: string | undefined;
    if (!response.body.ok && 'error' in response.body) {
      errorCode = response.body.error.code;
    }

    tracker.record({
      requestId: context.requestId,
      routeName: context.routeMeta.name,
      method: context.request.method,
      path: context.request.path,
      status: response.status,
      latencyMs,
      atIso: context.nowIso,
      workspaceId: context.workspaceId,
      keyId: context.principal?.keyId,
      ownerUserId: context.principal?.ownerUserId,
      errorCode,
    });

    return response;
  };
};

const mergeRouteSet = (
  primary: ReadonlyArray<ApiRouteAnalyticsSummary>,
  secondary: ReadonlyArray<ApiRouteAnalyticsSummary>
): ApiRouteAnalyticsSummary[] => {
  const all = new Map<string, ApiRouteAnalyticsSummary>();

  for (const route of [...primary, ...secondary]) {
    const existing = all.get(route.routeName);
    if (!existing) {
      all.set(route.routeName, { ...route });
      continue;
    }

    const requests = existing.requests + route.requests;
    const errors = existing.errors + route.errors;
    all.set(route.routeName, {
      routeName: route.routeName,
      requests,
      errors,
      errorRate: requests > 0 ? Number((errors / requests).toFixed(4)) : 0,
      p50Ms: Math.round((existing.p50Ms + route.p50Ms) / 2),
      p95Ms: Math.round((existing.p95Ms + route.p95Ms) / 2),
      p99Ms: Math.round((existing.p99Ms + route.p99Ms) / 2),
    });
  }

  return Array.from(all.values()).sort((left, right) => right.requests - left.requests);
};

export const combineAnalyticsWindows = (
  windows: ReadonlyArray<ApiAnalyticsWindowSummary>
): ApiAnalyticsWindowSummary => {
  if (windows.length === 0) {
    return {
      generatedAtIso: new Date().toISOString(),
      windowMinutes: 0,
      totalRequests: 0,
      errorRequests: 0,
      errorRate: 0,
      requestsPerMinute: 0,
      routes: [],
    };
  }

  const totalRequests = windows.reduce((sum, window) => sum + window.totalRequests, 0);
  const errorRequests = windows.reduce((sum, window) => sum + window.errorRequests, 0);
  const windowMinutes = Math.max(...windows.map((window) => window.windowMinutes));

  return {
    generatedAtIso: new Date().toISOString(),
    windowMinutes,
    totalRequests,
    errorRequests,
    errorRate: totalRequests > 0 ? Number((errorRequests / totalRequests).toFixed(4)) : 0,
    requestsPerMinute:
      windowMinutes > 0 ? Number((totalRequests / windowMinutes).toFixed(4)) : totalRequests,
    routes: windows.reduce<ApiRouteAnalyticsSummary[]>(
      (combined, window) => mergeRouteSet(combined, window.routes),
      []
    ),
  };
};
