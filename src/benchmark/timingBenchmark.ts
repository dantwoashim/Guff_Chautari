import {
  chunkResponseText,
  computeTimingPlan,
  simulateReadReceiptDelay,
} from '../engine/humanizer';

export interface TimingBenchmarkResult {
  sampleCount: number;
  chunkCount: number;
  averageReadDelayMs: number;
  averageTypingDurationMs: number;
  p95TypingDurationMs: number;
  passRate: number;
  passed: boolean;
}

interface TimingBenchmarkSample {
  text: string;
  emotionalComplexity: number;
}

const DEFAULT_SAMPLES: TimingBenchmarkSample[] = [
  { text: 'Yes, ship it now.', emotionalComplexity: 0.15 },
  { text: 'I agree, but we should define one measurable weekly objective first.', emotionalComplexity: 0.35 },
  { text: 'I am uncertain; we need to compare upside and downside scenarios before committing.', emotionalComplexity: 0.55 },
  { text: 'I care about this outcome deeply and I do not want to overpromise execution capacity.', emotionalComplexity: 0.7 },
  { text: 'Let us keep scope tight this week and review outcomes every Friday with explicit benchmark deltas.', emotionalComplexity: 0.4 },
  { text: 'I feel tension around this plan, so I need one pause day and then a more stable execution path.', emotionalComplexity: 0.78 },
];

const percentile = (values: number[], p: number): number => {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return sorted[index];
};

export const runTimingBenchmark = (samples: ReadonlyArray<TimingBenchmarkSample> = DEFAULT_SAMPLES): TimingBenchmarkResult => {
  const readDelays: number[] = [];
  const typingDurations: number[] = [];
  let chunkCount = 0;
  let passedChecks = 0;
  let totalChecks = 0;

  for (const sample of samples) {
    const chunks = chunkResponseText(sample.text, {
      minChunks: 1,
      maxChunks: 4,
      targetWordsPerChunk: 16,
    });

    const safeChunks = chunks.length > 0 ? chunks : [sample.text];
    chunkCount += safeChunks.length;

    safeChunks.forEach((chunk, index) => {
      const readDelay = simulateReadReceiptDelay(chunk.length, sample.emotionalComplexity);
      const timing = computeTimingPlan({
        text: chunk,
        chunkIndex: index,
        emotionalComplexity: sample.emotionalComplexity,
        readDelay,
      });

      readDelays.push(readDelay);
      typingDurations.push(timing.typingDuration);

      const inRange =
        timing.delayBefore >= 150 &&
        timing.delayBefore <= 12000 &&
        timing.typingDuration >= 300 &&
        timing.typingDuration <= 20000;
      totalChecks += 1;
      if (inRange) passedChecks += 1;
    });
  }

  const averageReadDelayMs =
    readDelays.length === 0 ? 0 : Math.round(readDelays.reduce((sum, value) => sum + value, 0) / readDelays.length);
  const averageTypingDurationMs =
    typingDurations.length === 0
      ? 0
      : Math.round(typingDurations.reduce((sum, value) => sum + value, 0) / typingDurations.length);
  const p95TypingDurationMs = Math.round(percentile(typingDurations, 0.95));
  const passRate = totalChecks === 0 ? 0 : Number((passedChecks / totalChecks).toFixed(4));

  return {
    sampleCount: samples.length,
    chunkCount,
    averageReadDelayMs,
    averageTypingDurationMs,
    p95TypingDurationMs,
    passRate,
    passed: passRate >= 0.95,
  };
};

