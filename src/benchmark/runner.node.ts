import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { BenchmarkReport } from './runner';

export const writeBenchmarkReport = async (
  report: BenchmarkReport,
  outputPath: string
): Promise<string> => {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(report, null, 2));
  return outputPath;
};
