import { loadPublishedBenchmarkHistory } from '../benchmark/publishing';
import {
  getTemplateById,
  listTemplateSubmissions,
  marketplaceStore,
  type TemplateItem,
} from '../marketplace';
import { resolveCreatorTier } from './program';
import type { CreatorProfile } from './types';

const average = (values: ReadonlyArray<number>): number => {
  if (values.length === 0) return 0;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
};

export const buildCreatorProfile = (userId: string): CreatorProfile => {
  const submissions = listTemplateSubmissions({ userId });
  const marketplaceState = marketplaceStore.load(userId);
  const latestBenchmark = loadPublishedBenchmarkHistory().slice(-1)[0];

  const publishedTemplateIds = submissions
    .filter((submission) => submission.status === 'approved')
    .map((submission) => submission.template.metadata.id);

  const publishedTemplates: TemplateItem[] = publishedTemplateIds
    .map((id) =>
      getTemplateById({
        userId,
        templateId: id,
      })
    )
    .filter((item): item is TemplateItem => Boolean(item));

  const ratings = publishedTemplateIds
    .map((templateId) => marketplaceState.ratings[templateId]?.average)
    .filter((value): value is number => typeof value === 'number');

  const averageRating = average(ratings);
  const benchmarkCompositeScore = latestBenchmark?.compositeScore ?? 0;

  return {
    userId,
    approvedTemplates: submissions.filter((submission) => submission.status === 'approved').length,
    pendingTemplates: submissions.filter((submission) => submission.status === 'community_review').length,
    rejectedTemplates: submissions.filter((submission) => submission.status === 'rejected').length,
    averageRating,
    benchmarkCompositeScore,
    benchmarkBadgeTier: latestBenchmark?.badgeTier ?? null,
    currentTier: resolveCreatorTier({
      approvedTemplates: submissions.filter((submission) => submission.status === 'approved').length,
      averageRating,
      benchmarkCompositeScore,
    }),
    publishedTemplates,
    submissions,
  };
};
