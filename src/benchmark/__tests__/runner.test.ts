import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runBenchmarkSuites } from '../runner';
import { writeBenchmarkReport } from '../runner.node';

describe('benchmark runner', () => {
  it('produces a JSON report with required suites', async () => {
    const outputPath = resolve(process.cwd(), 'artifacts/benchmarks/latest.json');
    const report = await runBenchmarkSuites();
    await writeBenchmarkReport(report, outputPath);

    expect(existsSync(outputPath)).toBe(true);
    expect(report.summary.totalSuites).toBeGreaterThanOrEqual(4);

    const parsed = JSON.parse(readFileSync(outputPath, 'utf8'));
    expect(parsed.suites.consistency).toBeDefined();
    expect(parsed.suites.recall).toBeDefined();
    expect(parsed.suites.timing).toBeDefined();
    expect(parsed.suites.safety).toBeDefined();
  });
});
