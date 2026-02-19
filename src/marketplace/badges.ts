import type { TemplateCommunityStats, TemplateItem, TemplateSubmission } from './types';

export type TemplateBadgeId =
  | 'benchmark_verified'
  | 'community_favorite'
  | 'creator_certified'
  | 'ashim_certified';

export interface TemplateBadge {
  id: TemplateBadgeId;
  label: string;
  reason: string;
}

const hasBenchmarkVerified = (payload: {
  submission?: TemplateSubmission | null;
  stats?: TemplateCommunityStats;
}): boolean => {
  if (payload.stats?.benchmarkVerified) return true;
  if ((payload.stats?.personaDriftScore ?? 0) >= 0.8) return true;
  const benchmarkCheck = payload.submission?.conformance.checks.find(
    (check) => check.id === 'persona_drift_benchmark'
  );
  return Boolean(benchmarkCheck?.passed);
};

const hasCommunityFavorite = (payload: {
  submission?: TemplateSubmission | null;
  stats?: TemplateCommunityStats;
  threshold: number;
}): boolean => {
  if ((payload.stats?.installCount ?? 0) >= payload.threshold) return true;

  const votes = payload.submission?.votes;
  if (!votes) return false;
  return votes.up >= payload.threshold && votes.up >= votes.down * 2;
};

const hasCreatorCertified = (payload: {
  submission?: TemplateSubmission | null;
  stats?: TemplateCommunityStats;
}): boolean => {
  if (payload.stats?.creatorCertified) return true;
  const tier = payload.submission?.submitterProfile.creatorTier;
  return tier === 'Certified' || tier === 'Featured';
};

const hasAshimCertified = (payload: {
  stats?: TemplateCommunityStats;
}): boolean => {
  return Boolean(payload.stats?.ashimCertified);
};

export const computeTemplateBadges = (payload: {
  template: TemplateItem;
  submission?: TemplateSubmission | null;
  stats?: TemplateCommunityStats;
  favoriteInstallThreshold?: number;
}): TemplateBadge[] => {
  const badges: TemplateBadge[] = [];
  const threshold = Math.max(3, payload.favoriteInstallThreshold ?? 10);

  if (hasBenchmarkVerified(payload)) {
    badges.push({
      id: 'benchmark_verified',
      label: 'Benchmark Verified',
      reason: 'Passed persona drift benchmark conformance checks.',
    });
  }

  if (hasCommunityFavorite({ ...payload, threshold })) {
    badges.push({
      id: 'community_favorite',
      label: 'Community Favorite',
      reason: `Reached strong adoption signals (${threshold}+ installs/upvotes).`,
    });
  }

  if (hasCreatorCertified(payload)) {
    badges.push({
      id: 'creator_certified',
      label: 'Creator Certified',
      reason: 'Submitted by a Certified/Featured creator tier.',
    });
  }

  if (hasAshimCertified(payload)) {
    badges.push({
      id: 'ashim_certified',
      label: 'Ashim Certified',
      reason: 'Passed the Ashim Certified conformance evaluator.',
    });
  }

  return badges;
};
