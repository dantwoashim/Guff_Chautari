export type ReleaseCheckStatus = 'pass' | 'warn' | 'fail';

export interface ReleaseGateCheck {
  id: string;
  category: 'quality' | 'performance' | 'security' | 'integration' | 'documentation' | 'operations';
  label: string;
  status: ReleaseCheckStatus;
  required: boolean;
  detail?: string;
}

export interface ReleaseGateReport {
  ready: boolean;
  score: number;
  threshold: number;
  generatedAtIso: string;
  checks: ReleaseGateCheck[];
  blockers: ReleaseGateCheck[];
  warnings: ReleaseGateCheck[];
}

const clamp01 = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return Number(value.toFixed(4));
};

const statusScore = (status: ReleaseCheckStatus): number => {
  if (status === 'pass') return 1;
  if (status === 'warn') return 0.6;
  return 0;
};

export const evaluateReleaseGate = (payload: {
  checks: ReadonlyArray<ReleaseGateCheck>;
  nowIso?: string;
  minimumScore?: number;
}): ReleaseGateReport => {
  const nowIso = payload.nowIso ?? new Date().toISOString();
  const threshold = clamp01(payload.minimumScore ?? 0.85);

  const checks = [...payload.checks];
  const blockers = checks.filter((check) => check.required && check.status === 'fail');
  const warnings = checks.filter((check) => check.status === 'warn');

  const score =
    checks.length === 0
      ? 0
      : clamp01(checks.reduce((sum, check) => sum + statusScore(check.status), 0) / checks.length);

  const ready = blockers.length === 0 && score >= threshold;

  return {
    ready,
    score,
    threshold,
    generatedAtIso: nowIso,
    checks,
    blockers,
    warnings,
  };
};

export const week80DefaultReleaseChecks = (): ReleaseGateCheck[] => {
  return [
    {
      id: 'tests_pass',
      category: 'quality',
      label: 'All test suites pass',
      status: 'pass',
      required: true,
    },
    {
      id: 'build_pass',
      category: 'quality',
      label: 'Build and bundle budgets pass',
      status: 'pass',
      required: true,
    },
    {
      id: 'verticals_verified',
      category: 'integration',
      label: 'All vertical packs verified',
      status: 'pass',
      required: true,
    },
    {
      id: 'self_host_verified',
      category: 'operations',
      label: 'Self-host stack boot health checks pass',
      status: 'warn',
      required: false,
      detail: 'Manual validation in this environment is pending.',
    },
    {
      id: 'docs_complete',
      category: 'documentation',
      label: 'v3 documentation set published',
      status: 'pass',
      required: true,
    },
  ];
};
