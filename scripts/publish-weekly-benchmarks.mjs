import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BENCHMARK_REPORT_PATH = resolve(process.cwd(), 'artifacts/benchmarks/latest.json');
const WEEKLY_DIR = resolve(process.cwd(), 'artifacts/benchmarks/weekly');
const HISTORY_PATH = resolve(WEEKLY_DIR, 'history.json');
const LATEST_PUBLISHED_PATH = resolve(WEEKLY_DIR, 'latest-published.json');
const SOCIAL_CARD_PATH = resolve(WEEKLY_DIR, 'social-card.svg');

const toUnit = (value) => Math.max(0, Math.min(1, Number(value)));
const asPct = (value) => Number((value * 100).toFixed(2));

const deriveSuiteScores = (report) => {
  const suites = report.suites ?? {};
  return {
    consistency: toUnit(
      ((suites.consistency?.details?.consistency_score ?? 0) +
        (suites.consistency?.details?.linguistic_consistency_score ?? 0)) /
        2
    ),
    recall: toUnit(suites.recall?.details?.recall_rate ?? (suites.recall?.passed ? 1 : 0)),
    timing: toUnit(suites.timing?.details?.pass_rate ?? (suites.timing?.passed ? 1 : 0)),
    safety: toUnit(suites.safety?.details?.pass_rate ?? (suites.safety?.passed ? 1 : 0)),
    relationship: toUnit(
      suites.relationship?.details?.final_trust_score ?? (suites.relationship?.passed ? 1 : 0)
    ),
  };
};

const compositeScore = (suiteScores) => {
  const values = Object.values(suiteScores);
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4));
};

const badgeTier = (score) => {
  if (score >= 0.9) return 'Platinum';
  if (score >= 0.8) return 'Gold';
  if (score >= 0.7) return 'Silver';
  return 'Bronze';
};

const detectRegressions = (current, previous) => {
  if (!previous) return [];
  const alerts = [];
  for (const suite of Object.keys(current)) {
    const prev = previous[suite];
    const now = current[suite];
    if (typeof prev !== 'number' || prev <= 0) continue;
    const deltaPercent = Number((((now - prev) / prev) * 100).toFixed(2));
    if (deltaPercent <= -5) {
      alerts.push({
        suite,
        previous: prev,
        current: now,
        deltaPercent,
        severity: deltaPercent <= -10 ? 'p0' : 'p1',
      });
    }
  }
  return alerts;
};

const socialCardSvg = (record) => {
  const scoreLine = Object.entries(record.suiteScores)
    .map(([suite, score]) => `${suite.toUpperCase()}: ${asPct(score)}%`)
    .join(' • ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b141a"/>
      <stop offset="100%" stop-color="#173b38"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <text x="60" y="110" fill="#e9edef" font-size="56" font-family="Arial">Ashim Weekly Benchmarks</text>
  <text x="60" y="180" fill="#9fb0ba" font-size="32" font-family="Arial">Badge: ${record.badgeTier} • Composite: ${asPct(record.compositeScore)}%</text>
  <text x="60" y="250" fill="#dffaf3" font-size="24" font-family="Arial">${scoreLine}</text>
  <text x="60" y="320" fill="#bfd8e8" font-size="24" font-family="Arial">Regressions: ${record.regressions.length}</text>
  <text x="60" y="560" fill="#7f929c" font-size="20" font-family="Arial">${new Date(record.generatedAtIso).toLocaleString()}</text>
</svg>`;
};

if (!existsSync(BENCHMARK_REPORT_PATH)) {
  console.error('Benchmark report missing. Run `npm run benchmark` first.');
  process.exit(1);
}

mkdirSync(WEEKLY_DIR, { recursive: true });

const report = JSON.parse(readFileSync(BENCHMARK_REPORT_PATH, 'utf8'));
const history = existsSync(HISTORY_PATH) ? JSON.parse(readFileSync(HISTORY_PATH, 'utf8')) : [];
const previous = Array.isArray(history) && history.length > 0 ? history[history.length - 1] : null;

const suiteScores = deriveSuiteScores(report);
const record = {
  id: `benchmark-week-${Date.now()}`,
  generatedAtIso: report.generatedAtIso ?? new Date().toISOString(),
  suiteScores,
  compositeScore: compositeScore(suiteScores),
  badgeTier: badgeTier(compositeScore(suiteScores)),
  regressions: detectRegressions(suiteScores, previous?.suiteScores),
  report,
};
record.socialCardSvg = socialCardSvg(record);

const dateTag = record.generatedAtIso.slice(0, 10);
writeFileSync(resolve(WEEKLY_DIR, `${dateTag}.json`), JSON.stringify(record, null, 2));
writeFileSync(HISTORY_PATH, JSON.stringify([...(Array.isArray(history) ? history : []), record].slice(-104), null, 2));
writeFileSync(LATEST_PUBLISHED_PATH, JSON.stringify(record, null, 2));
writeFileSync(SOCIAL_CARD_PATH, record.socialCardSvg);

console.log(`Published weekly benchmark record: ${record.id}`);
console.log(`Badge: ${record.badgeTier} | Composite: ${asPct(record.compositeScore)}%`);
console.log(`Regression alerts: ${record.regressions.length}`);
