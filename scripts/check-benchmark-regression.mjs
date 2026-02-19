import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const HISTORY_PATH = resolve(process.cwd(), 'artifacts/benchmarks/weekly/history.json');

if (!existsSync(HISTORY_PATH)) {
  console.log('No benchmark history found; regression gate skipped.');
  process.exit(0);
}

const history = JSON.parse(readFileSync(HISTORY_PATH, 'utf8'));
if (!Array.isArray(history) || history.length < 2) {
  console.log('Not enough history to evaluate regressions; gate skipped.');
  process.exit(0);
}

const latest = history[history.length - 1];
const regressions = Array.isArray(latest.regressions) ? latest.regressions : [];
const hardFailures = regressions.filter((alert) => Number(alert.deltaPercent) <= -5);

if (hardFailures.length === 0) {
  console.log('No benchmark regressions above 5%.');
  process.exit(0);
}

console.error(`Benchmark regression alert(s): ${hardFailures.length}`);
for (const alert of hardFailures) {
  console.error(
    `- ${alert.suite}: ${(alert.previous * 100).toFixed(2)}% -> ${(alert.current * 100).toFixed(2)}% (${alert.deltaPercent}%)`
  );
}

if (process.env.CI === 'true') {
  process.exit(1);
}

console.warn('Regression check failed, but local run is non-blocking outside CI.');
