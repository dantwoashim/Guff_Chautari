import type {
  DomainBenchmark,
  DomainBenchmarkDimension,
  DomainBenchmarkResult,
  DomainBenchmarkRunInput,
  VerticalConfig,
} from './types';

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

const normalizeWeight = (
  dimensions: ReadonlyArray<DomainBenchmarkDimension>
): DomainBenchmarkDimension[] => {
  const total = dimensions.reduce((sum, dimension) => sum + Math.max(0, dimension.weight), 0);
  if (total <= 0) {
    const equalWeight = Number((1 / Math.max(1, dimensions.length)).toFixed(6));
    return dimensions.map((dimension) => ({ ...dimension, weight: equalWeight }));
  }

  return dimensions.map((dimension) => ({
    ...dimension,
    weight: Number((Math.max(0, dimension.weight) / total).toFixed(6)),
  }));
};

const scoreDimension = (observed: number, target: number): number => {
  const safeTarget = target <= 0 ? 1 : target;
  const ratio = observed / safeTarget;
  return clamp(ratio, 0, 1);
};

export const createWeightedBenchmark = (payload: {
  id: string;
  title: string;
  description: string;
  dimensions: ReadonlyArray<DomainBenchmarkDimension>;
}): DomainBenchmark => {
  const dimensions = normalizeWeight(payload.dimensions);

  return {
    id: payload.id,
    title: payload.title,
    description: payload.description,
    dimensions,
    run: (input: DomainBenchmarkRunInput): DomainBenchmarkResult => {
      const scoredDimensions = dimensions.map((dimension) => {
        const observed = Number(input.observations[dimension.id] ?? 0);
        const score = scoreDimension(observed, dimension.target);

        return {
          id: dimension.id,
          score: Number(score.toFixed(4)),
          target: dimension.target,
          minimum: dimension.minimum,
          passed: observed >= dimension.minimum,
          weightedScore: score * dimension.weight,
        };
      });

      const score = scoredDimensions.reduce((sum, dimension) => sum + dimension.weightedScore, 0);
      const passed = scoredDimensions.every((dimension) => dimension.passed);

      return {
        benchmarkId: payload.id,
        verticalId: input.verticalId,
        score: Number(score.toFixed(4)),
        passed,
        dimensions: scoredDimensions.map((dimension) => ({
          id: dimension.id,
          score: dimension.score,
          target: dimension.target,
          minimum: dimension.minimum,
          passed: dimension.passed,
        })),
        generatedAtIso: input.nowIso,
      };
    },
  };
};

export interface DomainBenchmarkSuiteResult {
  verticalId: string;
  generatedAtIso: string;
  benchmarks: DomainBenchmarkResult[];
  summary: {
    count: number;
    passed: number;
    passRate: number;
    weightedScore: number;
  };
}

export const runVerticalBenchmarks = (payload: {
  vertical: VerticalConfig;
  observations: Record<string, number>;
  nowIso?: string;
}): DomainBenchmarkSuiteResult => {
  const nowIso = payload.nowIso ?? new Date().toISOString();

  const benchmarks = payload.vertical.benchmarks.map((benchmark) =>
    benchmark.run({
      verticalId: payload.vertical.id,
      nowIso,
      observations: payload.observations,
    })
  );

  const passed = benchmarks.filter((benchmark) => benchmark.passed).length;
  const weightedScore =
    benchmarks.length > 0
      ? Number(
          (
            benchmarks.reduce((sum, benchmark) => sum + benchmark.score, 0) / benchmarks.length
          ).toFixed(4)
        )
      : 0;

  return {
    verticalId: payload.vertical.id,
    generatedAtIso: nowIso,
    benchmarks,
    summary: {
      count: benchmarks.length,
      passed,
      passRate: benchmarks.length > 0 ? Number((passed / benchmarks.length).toFixed(4)) : 0,
      weightedScore,
    },
  };
};
