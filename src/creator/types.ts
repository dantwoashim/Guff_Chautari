import type { BenchmarkBadgeTier } from '../benchmark/publishing';
import type { TemplateItem, TemplateSubmission } from '../marketplace';

export type CreatorTier = 'Contributor' | 'Certified' | 'Featured';

export interface CreatorTierDefinition {
  tier: CreatorTier;
  minApprovedTemplates: number;
  minAverageRating: number;
  minCompositeScore: number;
  benefits: string[];
}

export interface CreatorProfile {
  userId: string;
  currentTier: CreatorTier;
  approvedTemplates: number;
  pendingTemplates: number;
  rejectedTemplates: number;
  averageRating: number;
  benchmarkCompositeScore: number;
  benchmarkBadgeTier: BenchmarkBadgeTier | null;
  publishedTemplates: TemplateItem[];
  submissions: TemplateSubmission[];
}
