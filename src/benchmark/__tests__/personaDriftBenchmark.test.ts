import { describe, expect, it } from 'vitest';
import { generateQuestionVariants, runPersonaDriftBenchmark } from '../personaDriftBenchmark';

describe('personaDriftBenchmark', () => {
  it('generates 50 variants and reports consistency baseline', async () => {
    const variants = generateQuestionVariants('How should I plan my week?', 50);
    expect(variants.length).toBe(50);

    const result = await runPersonaDriftBenchmark({
      baseQuestion: 'How should I plan my week?',
      responder: async (question) =>
        `Focus on one weekly outcome, three daily actions, and a nightly review. (${question.length})`,
      variantCount: 50,
    });

    expect(result.variantCount).toBe(50);
    expect(result.samples.length).toBe(50);
    expect(result.report.sampleCount).toBe(50);
    expect(result.report.consistencyScore).toBeGreaterThanOrEqual(0);
    expect(result.report.consistencyScore).toBeLessThanOrEqual(1);
    expect(result.linguisticConsistencyScore).toBeGreaterThanOrEqual(0);
    expect(result.linguisticConsistencyScore).toBeLessThanOrEqual(1);
  });
});
