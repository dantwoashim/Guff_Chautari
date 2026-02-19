export type CostWindow = 'day' | 'week' | 'month';

export interface ProviderUsageInput {
  workspaceId: string;
  providerId: string;
  model?: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd?: number;
  createdAtIso?: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface ProviderUsageRecord {
  id: string;
  workspaceId: string;
  providerId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  createdAtIso: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface ProviderCostRate {
  inputPer1KUsd: number;
  outputPer1KUsd: number;
}

export interface ProviderCostSummary {
  providerId: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCostUsd: number;
}

export interface WorkspaceCostSummary {
  workspaceId: string;
  window: CostWindow;
  fromIso: string;
  toIso: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  providerBreakdown: ProviderCostSummary[];
}

export interface BudgetEvaluationInput {
  workspaceId: string;
  monthlyBudgetUsd: number;
  alertThresholds?: number[];
  downgradeThreshold?: number;
  nowIso?: string;
}

export interface BudgetEvaluation {
  workspaceId: string;
  monthlyBudgetUsd: number;
  spentThisMonthUsd: number;
  projectedMonthEndUsd: number;
  usageRatio: number;
  remainingUsd: number;
  shouldDowngrade: boolean;
  thresholdState: number[];
  newlyReachedThresholds: number[];
}

interface ProviderCostTrackerOptions {
  nowIso?: () => string;
  ratesByProvider?: Record<string, ProviderCostRate>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const defaultRatesByProvider: Record<string, ProviderCostRate> = {
  gemini: { inputPer1KUsd: 0.00035, outputPer1KUsd: 0.0012 },
  openai: { inputPer1KUsd: 0.0025, outputPer1KUsd: 0.01 },
  anthropic: { inputPer1KUsd: 0.003, outputPer1KUsd: 0.015 },
  together: { inputPer1KUsd: 0.0008, outputPer1KUsd: 0.0012 },
  ollama: { inputPer1KUsd: 0, outputPer1KUsd: 0 },
};

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

const parseMs = (iso: string): number => {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const toIso = (value: number): string => new Date(value).toISOString();

const normalizeThresholds = (thresholds: ReadonlyArray<number>): number[] => {
  return [...new Set(thresholds)]
    .map((value) => Math.max(0, Math.min(1.5, value)))
    .sort((left, right) => left - right);
};

const startOfUtcDayMs = (dateMs: number): number => {
  const date = new Date(dateMs);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime();
};

const startOfUtcWeekMs = (dateMs: number): number => {
  const date = new Date(dateMs);
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime();
};

const startOfUtcMonthMs = (dateMs: number): number => {
  const date = new Date(dateMs);
  date.setUTCDate(1);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime();
};

const endOfUtcMonthMs = (dateMs: number): number => {
  const date = new Date(dateMs);
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + 1);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime() - 1;
};

const normalizeTokenCount = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
};

const roundUsd = (value: number): number => {
  return Math.round(value * 1_000_000) / 1_000_000;
};

const estimateCostUsd = (
  providerId: string,
  inputTokens: number,
  outputTokens: number,
  ratesByProvider: Record<string, ProviderCostRate>
): number => {
  const rates = ratesByProvider[providerId] ?? ratesByProvider.gemini;
  const inputCost = (inputTokens / 1000) * rates.inputPer1KUsd;
  const outputCost = (outputTokens / 1000) * rates.outputPer1KUsd;
  return roundUsd(inputCost + outputCost);
};

export class ProviderCostTracker {
  private readonly usageByWorkspaceId = new Map<string, ProviderUsageRecord[]>();
  private readonly reachedThresholdsByWorkspaceId = new Map<string, Set<number>>();
  private readonly nowIso: () => string;
  private readonly ratesByProvider: Record<string, ProviderCostRate>;

  constructor(options: ProviderCostTrackerOptions = {}) {
    this.nowIso = options.nowIso ?? (() => new Date().toISOString());
    this.ratesByProvider = {
      ...defaultRatesByProvider,
      ...(options.ratesByProvider ?? {}),
    };
  }

  recordUsage(input: ProviderUsageInput): ProviderUsageRecord {
    const createdAtIso = input.createdAtIso ?? this.nowIso();
    const inputTokens = normalizeTokenCount(input.inputTokens);
    const outputTokens = normalizeTokenCount(input.outputTokens);
    const totalTokens = inputTokens + outputTokens;
    const estimatedCostUsd =
      input.estimatedCostUsd !== undefined
        ? roundUsd(Math.max(0, input.estimatedCostUsd))
        : estimateCostUsd(input.providerId, inputTokens, outputTokens, this.ratesByProvider);

    const record: ProviderUsageRecord = {
      id: makeId('usage'),
      workspaceId: input.workspaceId,
      providerId: input.providerId,
      model: input.model?.trim() || 'unknown-model',
      inputTokens,
      outputTokens,
      totalTokens,
      estimatedCostUsd,
      createdAtIso,
      metadata: input.metadata,
    };

    const existing = this.usageByWorkspaceId.get(input.workspaceId) ?? [];
    existing.push(record);
    this.usageByWorkspaceId.set(input.workspaceId, existing);
    return record;
  }

  listUsage(payload: {
    workspaceId: string;
    window?: CostWindow;
    nowIso?: string;
  }): ProviderUsageRecord[] {
    const nowIso = payload.nowIso ?? this.nowIso();
    const all = this.usageByWorkspaceId.get(payload.workspaceId) ?? [];
    const nowMs = parseMs(nowIso);

    if (!payload.window) {
      return [...all].sort((left, right) => parseMs(right.createdAtIso) - parseMs(left.createdAtIso));
    }

    const fromMs = this.windowStartMs(payload.window, nowMs);
    const toMs = nowMs;

    return all
      .filter((row) => {
        const rowMs = parseMs(row.createdAtIso);
        return rowMs >= fromMs && rowMs <= toMs;
      })
      .sort((left, right) => parseMs(right.createdAtIso) - parseMs(left.createdAtIso));
  }

  summarizeWorkspace(payload: {
    workspaceId: string;
    window: CostWindow;
    nowIso?: string;
  }): WorkspaceCostSummary {
    const nowIso = payload.nowIso ?? this.nowIso();
    const nowMs = parseMs(nowIso);
    const rows = this.listUsage({
      workspaceId: payload.workspaceId,
      window: payload.window,
      nowIso,
    });

    const providerMap = new Map<string, ProviderCostSummary>();
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCostUsd = 0;

    for (const row of rows) {
      totalInputTokens += row.inputTokens;
      totalOutputTokens += row.outputTokens;
      totalCostUsd += row.estimatedCostUsd;

      const current = providerMap.get(row.providerId) ?? {
        providerId: row.providerId,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalTokens: 0,
        totalCostUsd: 0,
      };
      current.totalInputTokens += row.inputTokens;
      current.totalOutputTokens += row.outputTokens;
      current.totalTokens += row.totalTokens;
      current.totalCostUsd = roundUsd(current.totalCostUsd + row.estimatedCostUsd);
      providerMap.set(row.providerId, current);
    }

    return {
      workspaceId: payload.workspaceId,
      window: payload.window,
      fromIso: toIso(this.windowStartMs(payload.window, nowMs)),
      toIso: toIso(nowMs),
      totalInputTokens,
      totalOutputTokens,
      totalTokens: totalInputTokens + totalOutputTokens,
      totalCostUsd: roundUsd(totalCostUsd),
      providerBreakdown: [...providerMap.values()].sort((left, right) => right.totalCostUsd - left.totalCostUsd),
    };
  }

  evaluateBudget(payload: BudgetEvaluationInput): BudgetEvaluation {
    const nowIso = payload.nowIso ?? this.nowIso();
    const nowMs = parseMs(nowIso);
    const monthStartMs = startOfUtcMonthMs(nowMs);
    const monthEndMs = endOfUtcMonthMs(nowMs);
    const monthRows = (this.usageByWorkspaceId.get(payload.workspaceId) ?? []).filter((row) => {
      const rowMs = parseMs(row.createdAtIso);
      return rowMs >= monthStartMs && rowMs <= nowMs;
    });

    const spentThisMonthUsd = roundUsd(
      monthRows.reduce((sum, row) => sum + row.estimatedCostUsd, 0)
    );
    const elapsedDays = Math.max(1, Math.ceil((nowMs - monthStartMs + 1) / DAY_MS));
    const daysInMonth = Math.max(1, Math.ceil((monthEndMs - monthStartMs + 1) / DAY_MS));
    const projectedMonthEndUsd = roundUsd((spentThisMonthUsd / elapsedDays) * daysInMonth);
    const budget = Math.max(0.000001, payload.monthlyBudgetUsd);
    const usageRatio = spentThisMonthUsd / budget;

    const thresholds = normalizeThresholds(payload.alertThresholds ?? [0.5, 0.8, 1]);
    const previouslyReached =
      this.reachedThresholdsByWorkspaceId.get(payload.workspaceId) ?? new Set<number>();
    const reached = thresholds.filter((threshold) => usageRatio >= threshold);
    const newlyReached = reached.filter((threshold) => !previouslyReached.has(threshold));

    if (newlyReached.length > 0) {
      const merged = new Set<number>([...previouslyReached, ...reached]);
      this.reachedThresholdsByWorkspaceId.set(payload.workspaceId, merged);
    } else if (!this.reachedThresholdsByWorkspaceId.has(payload.workspaceId)) {
      this.reachedThresholdsByWorkspaceId.set(payload.workspaceId, new Set<number>(reached));
    }

    const downgradeThreshold = payload.downgradeThreshold ?? 0.8;
    const projectedRatio = projectedMonthEndUsd / budget;

    return {
      workspaceId: payload.workspaceId,
      monthlyBudgetUsd: payload.monthlyBudgetUsd,
      spentThisMonthUsd,
      projectedMonthEndUsd,
      usageRatio,
      remainingUsd: roundUsd(Math.max(0, payload.monthlyBudgetUsd - spentThisMonthUsd)),
      shouldDowngrade: usageRatio >= downgradeThreshold || projectedRatio >= downgradeThreshold,
      thresholdState: reached,
      newlyReachedThresholds: newlyReached,
    };
  }

  clearWorkspace(workspaceId: string): void {
    this.usageByWorkspaceId.delete(workspaceId);
    this.reachedThresholdsByWorkspaceId.delete(workspaceId);
  }

  private windowStartMs(window: CostWindow, nowMs: number): number {
    switch (window) {
      case 'day':
        return startOfUtcDayMs(nowMs);
      case 'week':
        return startOfUtcWeekMs(nowMs);
      case 'month':
      default:
        return startOfUtcMonthMs(nowMs);
    }
  }
}

export const providerCostTracker = new ProviderCostTracker();
