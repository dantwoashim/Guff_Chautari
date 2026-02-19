import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST_ASSETS_DIR = resolve(process.cwd(), 'dist/assets');
const OUTPUT_REPORT = resolve(process.cwd(), 'artifacts/perf/bundle-budget.json');
const SOFT_TARGET_GZIP_BYTES = 250 * 1024;
const HARD_LIMIT_GZIP_BYTES = Number(process.env.BUNDLE_BUDGET_GZIP_BYTES || 450000);
const WORKER_FILE_PATTERN = /worker/i;

if (!existsSync(DIST_ASSETS_DIR)) {
  console.error('dist/assets not found. Run `npm run build` before `npm run perf:budget`.');
  process.exit(1);
}

const entries = readdirSync(DIST_ASSETS_DIR).filter((file) => /\.(js|css)$/.test(file));

const allFiles = entries.map((file) => {
  const fullPath = join(DIST_ASSETS_DIR, file);
  const content = readFileSync(fullPath);
  return {
    file,
    rawBytes: content.length,
    gzipBytes: gzipSync(content).length,
    isWorker: WORKER_FILE_PATTERN.test(file),
  };
});

const appFiles = allFiles.filter((entry) => !entry.isWorker);
const workerFiles = allFiles.filter((entry) => entry.isWorker);

const totalRawBytes = appFiles.reduce((sum, entry) => sum + entry.rawBytes, 0);
const totalGzipBytes = appFiles.reduce((sum, entry) => sum + entry.gzipBytes, 0);
const totalWorkerRawBytes = workerFiles.reduce((sum, entry) => sum + entry.rawBytes, 0);
const totalWorkerGzipBytes = workerFiles.reduce((sum, entry) => sum + entry.gzipBytes, 0);

const report = {
  generatedAtIso: new Date().toISOString(),
  hardLimitGzipBytes: HARD_LIMIT_GZIP_BYTES,
  softTargetGzipBytes: SOFT_TARGET_GZIP_BYTES,
  totalRawBytes,
  totalGzipBytes,
  totalWorkerRawBytes,
  totalWorkerGzipBytes,
  hardLimitPassed: totalGzipBytes <= HARD_LIMIT_GZIP_BYTES,
  softTargetPassed: totalGzipBytes <= SOFT_TARGET_GZIP_BYTES,
  files: allFiles,
};

mkdirSync(resolve(process.cwd(), 'artifacts/perf'), { recursive: true });
writeFileSync(OUTPUT_REPORT, JSON.stringify(report, null, 2));

const kb = (bytes) => (bytes / 1024).toFixed(2);
console.log(`Bundle gzip size: ${kb(totalGzipBytes)} KB`);
console.log(`Worker gzip size: ${kb(totalWorkerGzipBytes)} KB`);
console.log(`Hard limit: ${kb(HARD_LIMIT_GZIP_BYTES)} KB`);
console.log(`Soft target: ${kb(SOFT_TARGET_GZIP_BYTES)} KB`);
console.log(`Report: ${OUTPUT_REPORT}`);

if (!report.hardLimitPassed) {
  console.error('Performance budget exceeded hard limit.');
  process.exit(1);
}

if (!report.softTargetPassed) {
  console.warn('Soft target missed. Keep reducing initial bundle size.');
}
