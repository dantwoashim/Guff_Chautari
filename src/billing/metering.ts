import type { UsageMetric, UsageRecord } from './types';

const DEFAULT_FLUSH_INTERVAL_MS = 5_000;

interface PendingUsageBucket {
  organizationId?: string;
  workspaceId?: string;
  subscriptionId?: string;
  metric: UsageMetric;
  quantity: number;
  firstRecordedAtIso: string;
  lastRecordedAtIso: string;
}

export interface MeteringRecordInput {
  organizationId?: string;
  workspaceId?: string;
  subscriptionId?: string;
  metric: UsageMetric;
  quantity?: number;
  nowIso?: string;
}

export interface UsageSummaryRow {
  metric: UsageMetric;
  quantity: number;
}

export interface UsageSummary {
  generatedAtIso: string;
  rows: UsageSummaryRow[];
  totalQuantity: number;
}

export interface UsageReportFilters {
  organizationId?: string;
  workspaceId?: string;
  subscriptionId?: string;
  metric?: UsageMetric;
  fromIso?: string;
  toIso?: string;
}

export interface UsageMeteringSnapshotBucket {
  organizationId?: string;
  workspaceId?: string;
  subscriptionId?: string;
  metric: UsageMetric;
  quantity: number;
  firstRecordedAtIso: string;
  lastRecordedAtIso: string;
}

export interface UsageMeteringSnapshot {
  pendingBuckets: UsageMeteringSnapshotBucket[];
  records: UsageRecord[];
  lastFlushAtMs: number;
}

const toMs = (iso: string): number => {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

const clampQuantity = (quantity: number): number => {
  if (!Number.isFinite(quantity)) return 0;
  return Math.max(0, quantity);
};

const makeBucketKey = (payload: {
  organizationId?: string;
  workspaceId?: string;
  subscriptionId?: string;
  metric: UsageMetric;
}): string =>
  [
    payload.organizationId ?? '*',
    payload.workspaceId ?? '*',
    payload.subscriptionId ?? '*',
    payload.metric,
  ].join('|');

export class UsageMeteringEngine {
  private readonly pendingBuckets = new Map<string, PendingUsageBucket>();
  private readonly records: UsageRecord[] = [];
  private readonly flushIntervalMs: number;
  private readonly nowMs: () => number;
  private lastFlushAtMs: number;

  constructor(payload?: { flushIntervalMs?: number; nowMs?: () => number }) {
    this.flushIntervalMs = Math.max(1_000, payload?.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS);
    this.nowMs = payload?.nowMs ?? (() => Date.now());
    this.lastFlushAtMs = this.nowMs();
  }

  recordUsage(payload: MeteringRecordInput): void {
    const nowIso = payload.nowIso ?? new Date(this.nowMs()).toISOString();
    this.flushIfDue(nowIso);

    const quantity = clampQuantity(payload.quantity ?? 1);
    if (quantity <= 0) return;

    const bucketKey = makeBucketKey(payload);
    const existing = this.pendingBuckets.get(bucketKey);
    if (existing) {
      this.pendingBuckets.set(bucketKey, {
        ...existing,
        quantity: existing.quantity + quantity,
        lastRecordedAtIso: nowIso,
      });
      return;
    }

    this.pendingBuckets.set(bucketKey, {
      organizationId: payload.organizationId,
      workspaceId: payload.workspaceId,
      subscriptionId: payload.subscriptionId,
      metric: payload.metric,
      quantity,
      firstRecordedAtIso: nowIso,
      lastRecordedAtIso: nowIso,
    });
  }

  flushIfDue(nowIso?: string): number {
    const effectiveNowIso = nowIso ?? new Date(this.nowMs()).toISOString();
    if (toMs(effectiveNowIso) - this.lastFlushAtMs < this.flushIntervalMs) {
      return 0;
    }
    return this.flush(effectiveNowIso);
  }

  flush(nowIso?: string): number {
    const effectiveNowIso = nowIso ?? new Date(this.nowMs()).toISOString();
    const records = [...this.pendingBuckets.values()]
      .filter((bucket) => bucket.quantity > 0)
      .map<UsageRecord>((bucket) => ({
        id: makeId('usage'),
        organizationId: bucket.organizationId,
        workspaceId: bucket.workspaceId,
        subscriptionId: bucket.subscriptionId,
        metric: bucket.metric,
        quantity: bucket.quantity,
        windowStartIso: bucket.firstRecordedAtIso,
        windowEndIso: bucket.lastRecordedAtIso,
        flushedAtIso: effectiveNowIso,
      }));

    this.records.push(...records);
    this.pendingBuckets.clear();
    this.lastFlushAtMs = toMs(effectiveNowIso);
    return records.length;
  }

  listUsageRecords(filters: UsageReportFilters = {}): UsageRecord[] {
    return this.records
      .filter((record) =>
        filters.organizationId ? record.organizationId === filters.organizationId : true
      )
      .filter((record) => (filters.workspaceId ? record.workspaceId === filters.workspaceId : true))
      .filter((record) =>
        filters.subscriptionId ? record.subscriptionId === filters.subscriptionId : true
      )
      .filter((record) => (filters.metric ? record.metric === filters.metric : true))
      .filter((record) => (filters.fromIso ? toMs(record.flushedAtIso) >= toMs(filters.fromIso) : true))
      .filter((record) => (filters.toIso ? toMs(record.flushedAtIso) <= toMs(filters.toIso) : true))
      .sort((left, right) => toMs(left.flushedAtIso) - toMs(right.flushedAtIso));
  }

  summarizeUsage(filters: UsageReportFilters = {}, nowIso?: string): UsageSummary {
    const rowsMap = new Map<UsageMetric, number>();

    for (const record of this.listUsageRecords(filters)) {
      rowsMap.set(record.metric, (rowsMap.get(record.metric) ?? 0) + record.quantity);
    }

    const rows = [...rowsMap.entries()]
      .map(([metric, quantity]) => ({ metric, quantity }))
      .sort((left, right) => left.metric.localeCompare(right.metric));
    const totalQuantity = rows.reduce((sum, row) => sum + row.quantity, 0);

    return {
      generatedAtIso: nowIso ?? new Date(this.nowMs()).toISOString(),
      rows,
      totalQuantity,
    };
  }

  exportState(): UsageMeteringSnapshot {
    return {
      pendingBuckets: [...this.pendingBuckets.values()].map((bucket) => ({ ...bucket })),
      records: this.records.map((record) => ({ ...record })),
      lastFlushAtMs: this.lastFlushAtMs,
    };
  }

  hydrateState(snapshot: UsageMeteringSnapshot): void {
    this.pendingBuckets.clear();
    this.records.length = 0;

    for (const bucket of snapshot.pendingBuckets ?? []) {
      const normalized: PendingUsageBucket = {
        organizationId: bucket.organizationId,
        workspaceId: bucket.workspaceId,
        subscriptionId: bucket.subscriptionId,
        metric: bucket.metric,
        quantity: clampQuantity(bucket.quantity),
        firstRecordedAtIso: bucket.firstRecordedAtIso,
        lastRecordedAtIso: bucket.lastRecordedAtIso,
      };
      this.pendingBuckets.set(makeBucketKey(normalized), normalized);
    }

    const seenRecordIds = new Set<string>();
    for (const record of snapshot.records ?? []) {
      if (!record?.id || seenRecordIds.has(record.id)) continue;
      seenRecordIds.add(record.id);
      this.records.push({
        ...record,
        quantity: clampQuantity(record.quantity),
      });
    }

    this.lastFlushAtMs = Number.isFinite(snapshot.lastFlushAtMs)
      ? snapshot.lastFlushAtMs
      : this.nowMs();
  }

  upsertUsageRecords(records: ReadonlyArray<UsageRecord>): void {
    const byId = new Map(this.records.map((record) => [record.id, { ...record }]));
    for (const record of records) {
      if (!record?.id) continue;
      byId.set(record.id, {
        ...record,
        quantity: clampQuantity(record.quantity),
      });
    }
    this.records.length = 0;
    this.records.push(...[...byId.values()].sort((left, right) => toMs(left.flushedAtIso) - toMs(right.flushedAtIso)));
  }

  resetForTests(): void {
    this.pendingBuckets.clear();
    this.records.length = 0;
    this.lastFlushAtMs = this.nowMs();
  }
}
