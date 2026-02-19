import { defaultProviderRegistry } from './registry';
import type { ModelProvider } from './types';
import {
  providerCostTracker,
  type BudgetEvaluation,
  type BudgetEvaluationInput,
  type ProviderUsageInput,
  type ProviderUsageRecord,
  type ProviderCostTracker,
} from './costTracker';

export type TaskClass =
  | 'reasoning'
  | 'code_generation'
  | 'embedding'
  | 'classification'
  | 'vision';

type ProviderLookup = {
  resolve(providerId: string): ModelProvider;
  list(): string[];
};

interface TaskCandidate {
  providerId: string;
  model: string;
}

interface TaskProfile {
  candidates: TaskCandidate[];
  budgetDowngrade?: TaskCandidate;
}

export interface TaskPreference {
  providerId?: string;
  model?: string;
  fallbackProviderId?: string;
  fallbackModel?: string;
}

export type TaskPreferences = Partial<Record<TaskClass, TaskPreference>>;

export interface TaskBudgetPolicy {
  monthlyBudgetUsd: number;
  alertThresholds?: number[];
  downgradeThreshold?: number;
}

export interface TaskRouteRequest {
  workspaceId: string;
  task: TaskClass;
  providerApiKeys?: Partial<Record<string, string>>;
  defaultApiKey?: string;
  allowFallback?: boolean;
  preferences?: TaskPreferences;
  budgetPolicy?: TaskBudgetPolicy;
}

export interface TaskRouteDecision {
  workspaceId: string;
  task: TaskClass;
  provider: ModelProvider;
  providerId: string;
  model: string;
  apiKey?: string;
  usedFallback: boolean;
  downgradedForBudget: boolean;
  budget?: BudgetEvaluation;
  notes: string[];
}

export interface TaskRouteFailure {
  providerId: string;
  model: string;
  reason: string;
}

interface TaskRouterOptions {
  providerLookup?: ProviderLookup;
  costTracker?: ProviderCostTracker;
  defaultPreferences?: TaskPreferences;
  defaultBudgetPolicy?: TaskBudgetPolicy;
  onBudgetAlert?: (payload: {
    workspaceId: string;
    budget: BudgetEvaluation;
    threshold: number;
  }) => void;
  profiles?: Partial<Record<TaskClass, TaskProfile>>;
}

const taskProfiles: Record<TaskClass, TaskProfile> = {
  reasoning: {
    candidates: [
      { providerId: 'gemini', model: 'gemini-2.5-pro' },
      { providerId: 'anthropic', model: 'claude-3-7-sonnet-latest' },
      { providerId: 'openai', model: 'gpt-4.1' },
    ],
    budgetDowngrade: { providerId: 'gemini', model: 'gemini-2.5-flash' },
  },
  code_generation: {
    candidates: [
      { providerId: 'openai', model: 'gpt-4.1' },
      { providerId: 'anthropic', model: 'claude-3-7-sonnet-latest' },
      { providerId: 'gemini', model: 'gemini-2.5-pro' },
    ],
    budgetDowngrade: { providerId: 'gemini', model: 'gemini-2.5-flash' },
  },
  embedding: {
    candidates: [
      { providerId: 'gemini', model: 'text-embedding-004' },
      { providerId: 'openai', model: 'text-embedding-3-large' },
      { providerId: 'together', model: 'togethercomputer/m2-bert-80M-32k-retrieval' },
    ],
    budgetDowngrade: { providerId: 'gemini', model: 'text-embedding-004' },
  },
  classification: {
    candidates: [
      { providerId: 'gemini', model: 'gemini-2.5-flash' },
      { providerId: 'openai', model: 'gpt-4.1-mini' },
      { providerId: 'anthropic', model: 'claude-3-5-haiku-latest' },
    ],
    budgetDowngrade: { providerId: 'gemini', model: 'gemini-2.5-flash' },
  },
  vision: {
    candidates: [
      { providerId: 'gemini', model: 'gemini-2.5-pro' },
      { providerId: 'openai', model: 'gpt-4.1' },
      { providerId: 'anthropic', model: 'claude-3-7-sonnet-latest' },
    ],
    budgetDowngrade: { providerId: 'gemini', model: 'gemini-2.5-flash' },
  },
};

const dedupeCandidates = (candidates: ReadonlyArray<TaskCandidate>): TaskCandidate[] => {
  const seen = new Set<string>();
  const out: TaskCandidate[] = [];

  for (const candidate of candidates) {
    const key = `${candidate.providerId}::${candidate.model}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }

  return out;
};

const normalizeReason = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
};

const isQuotaError = (errorCode?: string): boolean => {
  return errorCode === 'quota_exceeded' || errorCode === 'rate_limited';
};

export class TaskRouterError extends Error {
  readonly task: TaskClass;
  readonly attempts: TaskRouteFailure[];

  constructor(task: TaskClass, attempts: TaskRouteFailure[]) {
    super(
      `No healthy provider route available for task "${task}". ${attempts
        .map((attempt) => `${attempt.providerId}/${attempt.model}: ${attempt.reason}`)
        .join(' | ')}`
    );
    this.name = 'TaskRouterError';
    this.task = task;
    this.attempts = attempts;
  }
}

export class TaskRouter {
  private readonly providerLookup: ProviderLookup;
  private readonly costTracker: ProviderCostTracker;
  private readonly defaultPreferences: TaskPreferences;
  private readonly defaultBudgetPolicy?: TaskBudgetPolicy;
  private readonly onBudgetAlert?: TaskRouterOptions['onBudgetAlert'];
  private readonly profiles: Record<TaskClass, TaskProfile>;

  constructor(options: TaskRouterOptions = {}) {
    this.providerLookup = options.providerLookup ?? defaultProviderRegistry;
    this.costTracker = options.costTracker ?? providerCostTracker;
    this.defaultPreferences = options.defaultPreferences ?? {};
    this.defaultBudgetPolicy = options.defaultBudgetPolicy;
    this.onBudgetAlert = options.onBudgetAlert;
    this.profiles = {
      ...taskProfiles,
      ...(options.profiles ?? {}),
    };
  }

  async resolveTaskRoute(request: TaskRouteRequest): Promise<TaskRouteDecision> {
    const allowFallback = request.allowFallback !== false;
    const profile = this.profiles[request.task];
    const preference = request.preferences?.[request.task] ?? this.defaultPreferences[request.task];

    const budgetPolicy = request.budgetPolicy ?? this.defaultBudgetPolicy;
    const budget = budgetPolicy
      ? this.costTracker.evaluateBudget({
          workspaceId: request.workspaceId,
          monthlyBudgetUsd: budgetPolicy.monthlyBudgetUsd,
          alertThresholds: budgetPolicy.alertThresholds,
          downgradeThreshold: budgetPolicy.downgradeThreshold,
        } satisfies BudgetEvaluationInput)
      : undefined;

    if (budget && budget.newlyReachedThresholds.length > 0 && this.onBudgetAlert) {
      for (const threshold of budget.newlyReachedThresholds) {
        this.onBudgetAlert({
          workspaceId: request.workspaceId,
          budget,
          threshold,
        });
      }
    }

    const downgradedForBudget = Boolean(budget?.shouldDowngrade && profile.budgetDowngrade);

    const userPrimaryCandidate =
      preference?.providerId && preference.providerId.trim().length > 0
        ? {
            providerId: preference.providerId.trim(),
            model:
              preference.model?.trim() ||
              profile.candidates.find((candidate) => candidate.providerId === preference.providerId)
                ?.model ||
              profile.candidates[0].model,
          }
        : null;

    const userFallbackCandidate =
      preference?.fallbackProviderId && preference.fallbackProviderId.trim().length > 0
        ? {
            providerId: preference.fallbackProviderId.trim(),
            model:
              preference.fallbackModel?.trim() ||
              profile.candidates.find(
                (candidate) => candidate.providerId === preference.fallbackProviderId
              )?.model ||
              profile.candidates[0].model,
          }
        : null;

    const candidates = dedupeCandidates([
      ...(downgradedForBudget && profile.budgetDowngrade ? [profile.budgetDowngrade] : []),
      ...(userPrimaryCandidate ? [userPrimaryCandidate] : []),
      ...(userFallbackCandidate ? [userFallbackCandidate] : []),
      ...profile.candidates,
    ]);

    const knownProviders = new Set(this.providerLookup.list());
    const failures: TaskRouteFailure[] = [];

    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      if (index > 0 && !allowFallback) break;

      if (!knownProviders.has(candidate.providerId)) {
        failures.push({
          providerId: candidate.providerId,
          model: candidate.model,
          reason: 'provider_not_registered',
        });
        continue;
      }

      const provider = this.providerLookup.resolve(candidate.providerId);
      const apiKey =
        request.providerApiKeys?.[candidate.providerId]?.trim() ||
        request.defaultApiKey?.trim() ||
        undefined;

      if (apiKey) {
        try {
          const validation = await provider.validateKey(apiKey);
          if (!validation.ok || validation.status === 'invalid') {
            failures.push({
              providerId: candidate.providerId,
              model: candidate.model,
              reason: validation.errorCode || validation.errorMessage || 'invalid_api_key',
            });
            continue;
          }

          if (isQuotaError(validation.errorCode)) {
            failures.push({
              providerId: candidate.providerId,
              model: candidate.model,
              reason: validation.errorCode,
            });
            continue;
          }
        } catch (error) {
          failures.push({
            providerId: candidate.providerId,
            model: candidate.model,
            reason: normalizeReason(error),
          });
          continue;
        }
      }

      const notes: string[] = [];
      if (index > 0) {
        notes.push('fallback_route');
      }
      if (downgradedForBudget && candidate.providerId === profile.budgetDowngrade?.providerId) {
        notes.push('budget_downgrade');
      }
      if (budget && budget.newlyReachedThresholds.length > 0) {
        notes.push(`budget_alert:${budget.newlyReachedThresholds.join(',')}`);
      }

      return {
        workspaceId: request.workspaceId,
        task: request.task,
        provider,
        providerId: candidate.providerId,
        model: candidate.model,
        apiKey,
        usedFallback: index > 0,
        downgradedForBudget:
          downgradedForBudget &&
          candidate.providerId === profile.budgetDowngrade?.providerId &&
          candidate.model === profile.budgetDowngrade?.model,
        budget,
        notes,
      };
    }

    throw new TaskRouterError(request.task, failures);
  }

  recordUsage(payload: ProviderUsageInput): ProviderUsageRecord {
    return this.costTracker.recordUsage(payload);
  }
}

export const taskRouter = new TaskRouter();
