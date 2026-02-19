import type { TimingInput, TimingResult } from './types';

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

const wordCount = (text: string): number => {
  return text
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0).length;
};

export const computeTimingPlan = (input: TimingInput): TimingResult => {
  const words = wordCount(input.text);
  const complexity = clamp(input.emotionalComplexity, 0, 1);

  const delayBefore = Math.round(
    input.readDelay + 280 + input.chunkIndex * 140 + complexity * 520 + Math.min(450, words * 9)
  );

  const typingDuration = Math.round(350 + words * 190 + complexity * 600);

  return {
    delayBefore: clamp(delayBefore, 150, 12000),
    typingDuration: clamp(typingDuration, 300, 20000),
  };
};
