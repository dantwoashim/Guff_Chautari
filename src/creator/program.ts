import type { CreatorTier, CreatorTierDefinition } from './types';

export const CREATOR_TIER_DEFINITIONS: ReadonlyArray<CreatorTierDefinition> = [
  {
    tier: 'Contributor',
    minApprovedTemplates: 1,
    minAverageRating: 3.5,
    minCompositeScore: 0.5,
    benefits: ['Listed in creator directory', 'Template contribution badge'],
  },
  {
    tier: 'Certified',
    minApprovedTemplates: 3,
    minAverageRating: 4.0,
    minCompositeScore: 0.7,
    benefits: ['Priority template placement', 'Advanced benchmark visibility'],
  },
  {
    tier: 'Featured',
    minApprovedTemplates: 5,
    minAverageRating: 4.4,
    minCompositeScore: 0.82,
    benefits: ['Featured showcase slot', 'Early plugin ecosystem access'],
  },
];

export const resolveCreatorTier = (payload: {
  approvedTemplates: number;
  averageRating: number;
  benchmarkCompositeScore: number;
}): CreatorTier => {
  const sorted = [...CREATOR_TIER_DEFINITIONS].reverse();
  for (const definition of sorted) {
    if (
      payload.approvedTemplates >= definition.minApprovedTemplates &&
      payload.averageRating >= definition.minAverageRating &&
      payload.benchmarkCompositeScore >= definition.minCompositeScore
    ) {
      return definition.tier;
    }
  }
  return 'Contributor';
};
