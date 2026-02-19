import { computePersonaConsistency } from '../engine/persona/driftDetector';
import type { PersonaDriftReport, PersonaDriftSample } from '../engine/persona/types';

export interface PersonaDriftBenchmarkResult {
  baseQuestion: string;
  variantCount: number;
  report: PersonaDriftReport;
  linguisticConsistencyScore: number;
  samples: PersonaDriftSample[];
  generatedAt: number;
}

const makeVariantSuffixes = (): string[] => {
  const suffixes: string[] = [];

  const templates = [
    'in one practical paragraph',
    'with concrete steps',
    'for a beginner',
    'for someone under time pressure',
    'like a concise coach',
    'with clear tradeoffs',
    'with a weekly focus',
    'without fluff',
    'as if I start today',
    'as a checklist',
  ];

  for (let cycle = 0; cycle < 5; cycle += 1) {
    for (let index = 0; index < templates.length; index += 1) {
      suffixes.push(`${templates[index]} (variant ${cycle * templates.length + index + 1})`);
    }
  }

  return suffixes.slice(0, 50);
};

export const generateQuestionVariants = (baseQuestion: string, count = 50): string[] => {
  const suffixes = makeVariantSuffixes();
  const variants = suffixes.slice(0, count).map((suffix) => `${baseQuestion}, ${suffix}`);
  return variants;
};

export const runPersonaDriftBenchmark = async (params: {
  baseQuestion: string;
  responder: (question: string) => Promise<string>;
  variantCount?: number;
}): Promise<PersonaDriftBenchmarkResult> => {
  const variantCount = params.variantCount ?? 50;
  const questions = generateQuestionVariants(params.baseQuestion, variantCount);

  const samples: PersonaDriftSample[] = [];

  for (const question of questions) {
    const response = await params.responder(question);
    samples.push({ prompt: question, response });
  }

  const report = computePersonaConsistency(samples);
  const linguisticConsistencyScore = computeLinguisticConsistency(samples);

  return {
    baseQuestion: params.baseQuestion,
    variantCount: questions.length,
    report,
    linguisticConsistencyScore,
    samples,
    generatedAt: Date.now(),
  };
};

const tokenizeSentences = (value: string): string[] => {
  return value
    .split(/(?<=[.!?])\s+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
};

const avgSentenceLength = (value: string): number => {
  const sentences = tokenizeSentences(value);
  if (sentences.length === 0) return 0;
  const totalWords = sentences.reduce((sum, sentence) => {
    const words = sentence.split(/\s+/).filter((token) => token.length > 0);
    return sum + words.length;
  }, 0);
  return totalWords / sentences.length;
};

const punctuationSignature = (value: string): number => {
  const punct = value.match(/[!?.,;:]/g);
  return (punct?.length ?? 0) / Math.max(1, value.length);
};

const computeLinguisticConsistency = (samples: PersonaDriftSample[]): number => {
  if (samples.length === 0) return 0;

  const sentenceLengths = samples.map((sample) => avgSentenceLength(sample.response));
  const punctuationDensity = samples.map((sample) => punctuationSignature(sample.response));

  const meanSentenceLength =
    sentenceLengths.reduce((sum, value) => sum + value, 0) / sentenceLengths.length;
  const meanPunctuation =
    punctuationDensity.reduce((sum, value) => sum + value, 0) / punctuationDensity.length;

  const sentenceVariance =
    sentenceLengths.reduce((sum, value) => sum + Math.pow(value - meanSentenceLength, 2), 0) /
    sentenceLengths.length;
  const punctuationVariance =
    punctuationDensity.reduce((sum, value) => sum + Math.pow(value - meanPunctuation, 2), 0) /
    punctuationDensity.length;

  const sentencePenalty = Math.min(1, Math.sqrt(sentenceVariance) / 10);
  const punctuationPenalty = Math.min(1, Math.sqrt(punctuationVariance) / 0.05);
  const score = 1 - (sentencePenalty * 0.6 + punctuationPenalty * 0.4);
  return Number(Math.max(0, Math.min(1, score)).toFixed(4));
};
