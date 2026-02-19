import { runBenchmarkSuites, type BenchmarkReport } from './runner';

const STORAGE_KEY = 'ashim.benchmark.publish.v1';
const HISTORY_LIMIT = 104;

export type BenchmarkBadgeTier = 'Bronze' | 'Silver' | 'Gold' | 'Platinum';

export interface BenchmarkRegressionAlert {
  suite: keyof BenchmarkReport['suites'];
  previous: number;
  current: number;
  deltaPercent: number;
  severity: 'p0' | 'p1';
}

export interface WeeklyBenchmarkRecord {
  id: string;
  generatedAtIso: string;
  suiteScores: Record<keyof BenchmarkReport['suites'], number>;
  compositeScore: number;
  badgeTier: BenchmarkBadgeTier;
  regressions: BenchmarkRegressionAlert[];
  report: BenchmarkReport;
  socialCardSvg: string;
}

const inMemoryStorage = new Map<string, string>();

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

const readRaw = (key: string): string | null => {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      // Fall through to in-memory store.
    }
  }
  return inMemoryStorage.get(key) ?? null;
};

const writeRaw = (key: string, value: string): void => {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(key, value);
      return;
    } catch {
      // Fall through to in-memory store.
    }
  }
  inMemoryStorage.set(key, value);
};

const toUnitRange = (value: number): number => Math.max(0, Math.min(1, value));

const deriveSuiteScore = (
  suiteName: keyof BenchmarkReport['suites'],
  summary: BenchmarkReport['suites'][keyof BenchmarkReport['suites']]
): number => {
  const details = summary.details;
  const numeric = (key: string): number | null => {
    const value = details[key];
    return typeof value === 'number' ? value : null;
  };

  if (suiteName === 'consistency') {
    const consistency = numeric('consistency_score');
    const linguistic = numeric('linguistic_consistency_score');
    if (consistency !== null && linguistic !== null) {
      return toUnitRange((consistency + linguistic) / 2);
    }
  }

  if (suiteName === 'timing') {
    const passRate = numeric('pass_rate');
    if (passRate !== null) return toUnitRange(passRate);
  }

  if (suiteName === 'recall') {
    const recall = numeric('recall_rate');
    if (recall !== null) return toUnitRange(recall);
  }

  if (suiteName === 'safety') {
    const passRate = numeric('pass_rate');
    if (passRate !== null) return toUnitRange(passRate);
  }

  if (suiteName === 'relationship') {
    const trust = numeric('final_trust_score');
    if (trust !== null) return toUnitRange(trust);
  }

  return summary.passed ? 1 : 0;
};

export const scoreBenchmarkReport = (
  report: BenchmarkReport
): Record<keyof BenchmarkReport['suites'], number> => {
  return {
    consistency: deriveSuiteScore('consistency', report.suites.consistency),
    recall: deriveSuiteScore('recall', report.suites.recall),
    timing: deriveSuiteScore('timing', report.suites.timing),
    safety: deriveSuiteScore('safety', report.suites.safety),
    relationship: deriveSuiteScore('relationship', report.suites.relationship),
  };
};

export const computeCompositeScore = (
  suiteScores: Record<keyof BenchmarkReport['suites'], number>
): number => {
  const values = Object.values(suiteScores);
  const total = values.reduce((sum, value) => sum + value, 0);
  return Number((total / values.length).toFixed(4));
};

export const toBadgeTier = (score: number): BenchmarkBadgeTier => {
  if (score >= 0.9) return 'Platinum';
  if (score >= 0.8) return 'Gold';
  if (score >= 0.7) return 'Silver';
  return 'Bronze';
};

export const detectRegressions = (payload: {
  currentSuiteScores: Record<keyof BenchmarkReport['suites'], number>;
  previousSuiteScores?: Record<keyof BenchmarkReport['suites'], number>;
}): BenchmarkRegressionAlert[] => {
  if (!payload.previousSuiteScores) return [];

  const alerts: BenchmarkRegressionAlert[] = [];
  const suites = Object.keys(payload.currentSuiteScores) as Array<keyof BenchmarkReport['suites']>;

  for (const suite of suites) {
    const previous = payload.previousSuiteScores[suite];
    const current = payload.currentSuiteScores[suite];
    if (previous <= 0) continue;

    const deltaPercent = Number((((current - previous) / previous) * 100).toFixed(2));
    if (deltaPercent <= -5) {
      alerts.push({
        suite,
        previous,
        current,
        deltaPercent,
        severity: deltaPercent <= -10 ? 'p0' : 'p1',
      });
    }
  }

  return alerts;
};

export const createBenchmarkSocialCardSvg = (record: WeeklyBenchmarkRecord): string => {
  const suites = Object.entries(record.suiteScores)
    .map(([suite, score]) => `${suite.toUpperCase()}: ${(score * 100).toFixed(1)}%`)
    .join(' • ');
  const regressionLine =
    record.regressions.length === 0
      ? 'No regressions > 5%'
      : `${record.regressions.length} regression alert(s)`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#0b141a"/>
      <stop offset="100%" stop-color="#173b38"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <text x="60" y="110" fill="#e9edef" font-size="56" font-family="Arial">Ashim Weekly Benchmarks</text>
  <text x="60" y="180" fill="#9fb0ba" font-size="32" font-family="Arial">Badge: ${record.badgeTier} • Composite: ${(record.compositeScore * 100).toFixed(1)}%</text>
  <text x="60" y="250" fill="#dffaf3" font-size="24" font-family="Arial">${suites}</text>
  <text x="60" y="320" fill="#bfd8e8" font-size="24" font-family="Arial">${regressionLine}</text>
  <text x="60" y="560" fill="#7f929c" font-size="20" font-family="Arial">${new Date(record.generatedAtIso).toLocaleString()}</text>
</svg>`;
};

export const buildWeeklyBenchmarkRecord = (payload: {
  report: BenchmarkReport;
  previousRecord?: WeeklyBenchmarkRecord;
}): WeeklyBenchmarkRecord => {
  const suiteScores = scoreBenchmarkReport(payload.report);
  const compositeScore = computeCompositeScore(suiteScores);
  const regressions = detectRegressions({
    currentSuiteScores: suiteScores,
    previousSuiteScores: payload.previousRecord?.suiteScores,
  });

  const base: WeeklyBenchmarkRecord = {
    id: makeId('benchmark-week'),
    generatedAtIso: payload.report.generatedAtIso,
    suiteScores,
    compositeScore,
    badgeTier: toBadgeTier(compositeScore),
    regressions,
    report: payload.report,
    socialCardSvg: '',
  };

  return {
    ...base,
    socialCardSvg: createBenchmarkSocialCardSvg(base),
  };
};

export const loadPublishedBenchmarkHistory = (): WeeklyBenchmarkRecord[] => {
  const raw = readRaw(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as WeeklyBenchmarkRecord[]) : [];
  } catch {
    return [];
  }
};

export const savePublishedBenchmarkHistory = (records: ReadonlyArray<WeeklyBenchmarkRecord>): void => {
  writeRaw(STORAGE_KEY, JSON.stringify(records.slice(-HISTORY_LIMIT)));
};

export const publishWeeklyBenchmarks = async (): Promise<WeeklyBenchmarkRecord> => {
  const report = await runBenchmarkSuites();
  const history = loadPublishedBenchmarkHistory();
  const previous = history[history.length - 1];
  const record = buildWeeklyBenchmarkRecord({
    report,
    previousRecord: previous,
  });
  savePublishedBenchmarkHistory([...history, record]);
  return record;
};
