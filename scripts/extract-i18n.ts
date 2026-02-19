#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { arBundle } from '../src/i18n/locales/ar';
import { enBundle } from '../src/i18n/locales/en';
import { esBundle } from '../src/i18n/locales/es';
import { hiBundle } from '../src/i18n/locales/hi';
import { jaBundle } from '../src/i18n/locales/ja';

const root = process.cwd();
const outputPath = resolve(root, 'docs', 'i18n-extraction-report.json');

const bundleByLocale = {
  en: enBundle,
  es: esBundle,
  hi: hiBundle,
  ja: jaBundle,
  ar: arBundle,
} as const;

const extractKeysFromCode = (): string[] => {
  const command = "rg -n --no-heading \"i18nRuntime\\.t\\(['\\\"]([^'\\\"]+)['\\\"]\" App.tsx components src";
  const output = execSync(command, { cwd: root, encoding: 'utf8' });
  const keys = output
    .split('\n')
    .flatMap((line) => {
      const match = line.match(/i18nRuntime\.t\(['"]([^'"]+)['"]/);
      return match ? [match[1]] : [];
    });
  return [...new Set(keys)].sort((left, right) => left.localeCompare(right));
};

const keys = extractKeysFromCode();

const report = {
  generatedAtIso: new Date().toISOString(),
  keyCount: keys.length,
  keys,
  missingByLocale: Object.fromEntries(
    Object.entries(bundleByLocale).map(([locale, bundle]) => {
      const missing = keys.filter((key) => bundle.messages[key] === undefined);
      return [locale, missing];
    })
  ),
};

writeFileSync(outputPath, JSON.stringify(report, null, 2));
console.log(`i18n extraction written to ${outputPath}`);
