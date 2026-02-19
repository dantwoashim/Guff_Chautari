import type { ImperfectionOptions } from './types';

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

const lcg = (seed: number): (() => number) => {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
};

const substitutions: Array<[RegExp, string]> = [
  [/\byou\b/gi, 'u'],
  [/\byour\b/gi, 'ur'],
  [/\breally\b/gi, 'rly'],
  [/\bplease\b/gi, 'pls'],
  [/\bthanks\b/gi, 'thx'],
];

export const applyImperfections = (text: string, options: ImperfectionOptions = {}): string => {
  const enabled = options.enabled ?? true;
  const intensity = clamp(options.intensity ?? 0.25, 0, 1);

  if (!enabled || intensity <= 0 || text.trim().length === 0) {
    return text;
  }

  const seed = options.seed ?? text.length;
  const random = lcg(seed);

  let output = text;

  for (const [pattern, replacement] of substitutions) {
    if (random() < intensity) {
      output = output.replace(pattern, replacement);
    }
  }

  if (random() < intensity * 0.5) {
    output = output.replace(/\bI\b/g, 'i');
  }

  if (random() < intensity * 0.35) {
    output = output.replace(/\.$/, '');
  }

  return output;
};
