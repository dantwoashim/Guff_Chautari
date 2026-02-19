import type { PersonaDriftReport, PersonaDriftSample } from './types';

const STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'that',
  'with',
  'this',
  'you',
  'your',
  'are',
  'was',
  'have',
  'from',
  'will',
  'just',
  'into',
  'about',
]);

const tokenize = (value: string): Set<string> => {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/gi, ' ')
      .split(/\s+/)
      .filter((token) => token.length >= 3)
      .filter((token) => !STOPWORDS.has(token))
  );
};

const jaccard = (left: Set<string>, right: Set<string>): number => {
  if (left.size === 0 && right.size === 0) return 1;
  if (left.size === 0 || right.size === 0) return 0;

  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }

  const union = left.size + right.size - intersection;
  return union === 0 ? 0 : intersection / union;
};

export const computePersonaConsistency = (samples: PersonaDriftSample[]): PersonaDriftReport => {
  if (samples.length === 0) {
    return {
      sampleCount: 0,
      consistencyScore: 0,
      averageSimilarity: 0,
      lowestSimilarity: 0,
      highestSimilarity: 0,
    };
  }

  const tokenized = samples.map((sample) => tokenize(sample.response));
  const baseline = tokenized[0];

  const similarities = tokenized.map((tokens) => jaccard(baseline, tokens));
  const average = similarities.reduce((sum, value) => sum + value, 0) / similarities.length;

  return {
    sampleCount: samples.length,
    consistencyScore: Number(average.toFixed(4)),
    averageSimilarity: Number(average.toFixed(4)),
    lowestSimilarity: Number(Math.min(...similarities).toFixed(4)),
    highestSimilarity: Number(Math.max(...similarities).toFixed(4)),
  };
};
