import { runMemoryRecallBenchmark } from './memoryRecallBenchmark';
import { runPersonaDriftBenchmark } from './personaDriftBenchmark';
import { runRelationshipEvolutionBenchmark } from './relationshipEvolutionBenchmark';
import { runTimingBenchmark } from './timingBenchmark';
import { runSafetyBenchmark } from './safetyBenchmark';

export interface BenchmarkSuiteSummary {
  passed: boolean;
  details: Record<string, string | number | boolean | string[]>;
}

export interface BenchmarkReport {
  generatedAtIso: string;
  suites: {
    consistency: BenchmarkSuiteSummary;
    recall: BenchmarkSuiteSummary;
    timing: BenchmarkSuiteSummary;
    safety: BenchmarkSuiteSummary;
    relationship: BenchmarkSuiteSummary;
  };
  summary: {
    totalSuites: number;
    passedSuites: number;
    passRate: number;
    overallPassed: boolean;
  };
}

export const runBenchmarkSuites = async (): Promise<BenchmarkReport> => {
  const consistencyResult = await runPersonaDriftBenchmark({
    baseQuestion: 'How should I execute my next week with zero drift?',
    variantCount: 50,
    responder: async (question) => {
      const base =
        'Anchor on one measurable weekly outcome, schedule daily execution blocks, and review benchmark deltas every Friday.';
      const tone = question.toLowerCase().includes('beginner')
        ? 'Keep language simple and concrete.'
        : 'Keep tradeoffs explicit and practical.';
      return `${base} ${tone}`;
    },
  });

  const recallResult = await runMemoryRecallBenchmark({
    factCount: 20,
    turns: 100,
    retrievalLimit: 3,
    targetRate: 0.65,
  });

  const timingResult = runTimingBenchmark();
  const safetyResult = runSafetyBenchmark();
  const relationshipResult = runRelationshipEvolutionBenchmark({
    turns: 100,
    attachmentStyle: 'secure',
  });

  const suites = {
    consistency: {
      passed:
        consistencyResult.report.consistencyScore >= 0.55 &&
        consistencyResult.linguisticConsistencyScore >= 0.5,
      details: {
        sample_count: consistencyResult.report.sampleCount,
        consistency_score: consistencyResult.report.consistencyScore,
        linguistic_consistency_score: consistencyResult.linguisticConsistencyScore,
        lowest_similarity: consistencyResult.report.lowestSimilarity,
        highest_similarity: consistencyResult.report.highestSimilarity,
      },
    },
    recall: {
      passed: recallResult.passed,
      details: {
        planted_facts: recallResult.plantedFacts,
        recovered: recallResult.recovered,
        recall_rate: recallResult.recallRate,
        target_rate: recallResult.targetRate,
        misses: recallResult.misses,
      },
    },
    timing: {
      passed: timingResult.passed,
      details: {
        sample_count: timingResult.sampleCount,
        chunk_count: timingResult.chunkCount,
        average_read_delay_ms: timingResult.averageReadDelayMs,
        average_typing_duration_ms: timingResult.averageTypingDurationMs,
        p95_typing_duration_ms: timingResult.p95TypingDurationMs,
        pass_rate: timingResult.passRate,
      },
    },
    safety: {
      passed: safetyResult.passed,
      details: {
        total_checks: safetyResult.totalChecks,
        passed_checks: safetyResult.passedChecks,
        pass_rate: safetyResult.passRate,
        violations: safetyResult.violations,
      },
    },
    relationship: {
      passed: relationshipResult.finalStage !== 'stranger' && relationshipResult.repairRecovered,
      details: {
        final_stage: relationshipResult.finalStage,
        final_trust_score: relationshipResult.finalTrustScore,
        unresolved_conflict_turns: relationshipResult.unresolvedConflictTurns,
        repair_recovered: relationshipResult.repairRecovered,
      },
    },
  } satisfies BenchmarkReport['suites'];

  const suiteNames = Object.keys(suites) as Array<keyof typeof suites>;
  const passedSuites = suiteNames.filter((name) => suites[name].passed).length;
  const totalSuites = suiteNames.length;

  return {
    generatedAtIso: new Date().toISOString(),
    suites,
    summary: {
      totalSuites,
      passedSuites,
      passRate: Number((passedSuites / totalSuites).toFixed(4)),
      overallPassed: passedSuites === totalSuites,
    },
  };
};
