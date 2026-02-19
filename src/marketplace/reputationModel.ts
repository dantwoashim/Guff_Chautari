import { loadPublishedBenchmarkHistory } from '../benchmark/publishing';
import { marketplaceStore } from './store';
import { listRegistryPackages } from './registry';

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const average = (values: ReadonlyArray<number>): number => {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const weightedAverageRating = (
  ratings: ReadonlyArray<{ average: number; votes: number }>
): number => {
  if (ratings.length === 0) return 0;

  let weightedTotal = 0;
  let voteTotal = 0;
  for (const rating of ratings) {
    weightedTotal += rating.average * Math.max(0, rating.votes);
    voteTotal += Math.max(0, rating.votes);
  }
  if (voteTotal === 0) return 0;
  return weightedTotal / voteTotal;
};

export type CreatorReputationTier = 'emerging' | 'trusted' | 'leading' | 'world_class';

export interface CreatorReputation {
  creatorUserId: string;
  score: number;
  tier: CreatorReputationTier;
  signals: {
    approvedTemplates: number;
    qualityAverage: number;
    installCount: number;
    ratingAverage: number;
    benchmarkComposite: number;
    registryPackages: number;
    activeRegistryPackages: number;
    registryConsistency: number;
  };
  breakdown: {
    qualityScore: number;
    adoptionScore: number;
    ratingScore: number;
    benchmarkScore: number;
    consistencyScore: number;
  };
}

const scoreInstallCount = (installCount: number): number => {
  // Log curve: 0 installs => 0, ~10 installs => 0.6, ~100 installs => 1.
  const normalized = Math.log10(Math.max(1, installCount + 1)) / 2;
  return clamp(normalized, 0, 1);
};

const toTier = (score: number): CreatorReputationTier => {
  if (score >= 0.86) return 'world_class';
  if (score >= 0.72) return 'leading';
  if (score >= 0.55) return 'trusted';
  return 'emerging';
};

export const computeCreatorReputation = (payload: {
  creatorUserId: string;
}): CreatorReputation => {
  const state = marketplaceStore.load(payload.creatorUserId);
  const approvedSubmissions = state.submissions.filter((submission) => submission.status === 'approved');
  const approvedTemplateIds = new Set(
    approvedSubmissions.map((submission) => submission.template.metadata.id)
  );

  const qualityAverage = average(approvedSubmissions.map((submission) => submission.qualityScore));

  const installCount = Object.entries(state.templateStats)
    .filter(([templateId]) => approvedTemplateIds.has(templateId))
    .reduce((total, [, stats]) => total + Math.max(0, stats.installCount), 0);

  const ratingAverage = weightedAverageRating(
    Object.entries(state.ratings)
      .filter(([templateId]) => approvedTemplateIds.has(templateId))
      .map(([, rating]) => rating)
  );

  const latestBenchmark = loadPublishedBenchmarkHistory().slice(-1)[0];
  const benchmarkComposite = latestBenchmark?.compositeScore ?? 0;

  const registryPackages = listRegistryPackages({
    publisherUserId: payload.creatorUserId,
    includeDeprecated: true,
  });
  const activeRegistryPackages = registryPackages.filter((entry) => entry.status === 'active').length;
  const registryConsistency =
    registryPackages.length === 0 ? 0 : activeRegistryPackages / registryPackages.length;

  const qualityScore = clamp(qualityAverage, 0, 1);
  const adoptionScore = scoreInstallCount(installCount);
  const ratingScore = clamp(ratingAverage / 5, 0, 1);
  const benchmarkScore = clamp(benchmarkComposite, 0, 1);
  const consistencyScore = clamp(registryConsistency, 0, 1);

  const score = Number(
    clamp(
      qualityScore * 0.3 +
        adoptionScore * 0.25 +
        ratingScore * 0.2 +
        benchmarkScore * 0.15 +
        consistencyScore * 0.1,
      0,
      1
    ).toFixed(4)
  );

  return {
    creatorUserId: payload.creatorUserId,
    score,
    tier: toTier(score),
    signals: {
      approvedTemplates: approvedSubmissions.length,
      qualityAverage: Number(qualityAverage.toFixed(4)),
      installCount,
      ratingAverage: Number(ratingAverage.toFixed(4)),
      benchmarkComposite: Number(benchmarkComposite.toFixed(4)),
      registryPackages: registryPackages.length,
      activeRegistryPackages,
      registryConsistency: Number(registryConsistency.toFixed(4)),
    },
    breakdown: {
      qualityScore: Number(qualityScore.toFixed(4)),
      adoptionScore: Number(adoptionScore.toFixed(4)),
      ratingScore: Number(ratingScore.toFixed(4)),
      benchmarkScore: Number(benchmarkScore.toFixed(4)),
      consistencyScore: Number(consistencyScore.toFixed(4)),
    },
  };
};

export const listRegistryCreatorLeaderboard = (payload: {
  limit?: number;
} = {}): CreatorReputation[] => {
  const limit = Math.max(1, payload.limit ?? 20);
  const creatorIds = [...new Set(listRegistryPackages({ includeDeprecated: true }).map((entry) => entry.publisherUserId))];

  return creatorIds
    .map((creatorUserId) => computeCreatorReputation({ creatorUserId }))
    .sort((left, right) => {
      if (left.score !== right.score) return right.score - left.score;
      return left.creatorUserId.localeCompare(right.creatorUserId);
    })
    .slice(0, limit);
};
