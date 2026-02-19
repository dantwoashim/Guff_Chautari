export type ServiceHealthStatus = 'healthy' | 'degraded' | 'down';

export interface ServiceHealthInput {
  service: string;
  required: boolean;
  status: ServiceHealthStatus;
  latencyMs?: number;
  message?: string;
}

export interface ServiceHealthResult extends ServiceHealthInput {
  weight: number;
  score: number;
}

export interface SelfHostReadinessReport {
  ready: boolean;
  score: number;
  threshold: number;
  generatedAtIso: string;
  services: ServiceHealthResult[];
  blockers: string[];
  warnings: string[];
}

const clamp01 = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return Number(value.toFixed(4));
};

const statusToScore = (status: ServiceHealthStatus): number => {
  if (status === 'healthy') return 1;
  if (status === 'degraded') return 0.5;
  return 0;
};

export const evaluateSelfHostReadiness = (payload: {
  services: ReadonlyArray<ServiceHealthInput>;
  nowIso?: string;
  minimumScore?: number;
}): SelfHostReadinessReport => {
  const nowIso = payload.nowIso ?? new Date().toISOString();
  const threshold = clamp01(payload.minimumScore ?? 0.75);

  const normalized = payload.services.map((service) => {
    const weight = service.required ? 1.3 : 0.7;
    const score = statusToScore(service.status);

    return {
      ...service,
      weight,
      score,
    } satisfies ServiceHealthResult;
  });

  const weightedTotal = normalized.reduce((sum, entry) => sum + entry.weight, 0);
  const weightedScore =
    weightedTotal === 0
      ? 0
      : normalized.reduce((sum, entry) => sum + entry.score * entry.weight, 0) / weightedTotal;
  const score = clamp01(weightedScore);

  const blockers = normalized
    .filter((entry) => entry.required && entry.status === 'down')
    .map((entry) => `${entry.service} is down.`);

  const warnings = normalized
    .filter((entry) => entry.status === 'degraded' || (!entry.required && entry.status === 'down'))
    .map((entry) => {
      const base = `${entry.service} is ${entry.status}.`;
      if (!entry.message) return base;
      return `${base} ${entry.message}`;
    });

  const ready = blockers.length === 0 && score >= threshold;

  return {
    ready,
    score,
    threshold,
    generatedAtIso: nowIso,
    services: normalized,
    blockers,
    warnings,
  };
};
