import type { WorkflowStepKind, WorkflowTriggerType } from '../workflows';
import type { BenchmarkBadgeTier } from '../benchmark/publishing';
import type { CreatorTier } from '../creator/types';

export type TemplateKind = 'persona' | 'workflow';

export type TemplateCategory =
  | 'productivity'
  | 'wellbeing'
  | 'learning'
  | 'creative'
  | 'engineering'
  | 'operations';

export interface TemplateMetadata {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  tags: string[];
  author: string;
  version: string;
  createdAtIso: string;
  updatedAtIso: string;
  featured?: boolean;
}

export interface TemplateRating {
  average: number;
  votes: number;
}

export interface PersonaTemplate {
  kind: 'persona';
  metadata: TemplateMetadata;
  personaYaml: string;
  summary: string;
}

export interface WorkflowTemplateStep {
  id: string;
  title: string;
  description: string;
  kind: WorkflowStepKind;
  actionId: string;
  inputTemplate?: string;
}

export interface WorkflowTemplate {
  kind: 'workflow';
  metadata: TemplateMetadata;
  naturalLanguagePrompt: string;
  connectorRequirements: string[];
  triggerType: WorkflowTriggerType;
  steps: WorkflowTemplateStep[];
}

export type TemplateItem = PersonaTemplate | WorkflowTemplate;

export type TemplateSubmissionStatus =
  | 'pending_auto_review'
  | 'community_review'
  | 'changes_requested'
  | 'approved'
  | 'rejected';

export interface TemplateAutoReview {
  passed: boolean;
  issues: string[];
}

export interface TemplateSubmitterProfile {
  userId: string;
  displayName: string;
  creatorTier?: CreatorTier;
  benchmarkBadgeTier?: BenchmarkBadgeTier | null;
}

export interface TemplateConformanceCheck {
  id: string;
  passed: boolean;
  message: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface TemplateConformanceReport {
  passed: boolean;
  issues: string[];
  checks: TemplateConformanceCheck[];
  evaluatedAtIso: string;
}

export type TemplateReviewDecision = 'approve' | 'request_changes' | 'reject';

export interface TemplateReviewRecord {
  id: string;
  reviewerId: string;
  decision: TemplateReviewDecision;
  notes?: string;
  createdAtIso: string;
  qualityScoreDelta: number;
}

export interface TemplateQualitySignals {
  validationScore: number;
  conformanceScore: number;
  benchmarkScore: number;
  creatorScore: number;
  metadataCompletenessScore: number;
}

export interface TemplateCommunityStats {
  installCount: number;
  usageCount: number;
  lastInstalledAtIso?: string;
  autoConfiguredAtIso?: string;
  personaDriftScore?: number;
  benchmarkVerified?: boolean;
  creatorCertified?: boolean;
  ashimCertified?: boolean;
  certificationLevel?: 'none' | 'certified' | 'gold' | 'platinum';
  certificationScore?: number;
  certificationUpdatedAtIso?: string;
}

export interface TemplateUserReview {
  id: string;
  userId: string;
  score: number;
  text?: string;
  createdAtIso: string;
  usageCountAtReview: number;
}

export interface TemplateSubmission {
  id: string;
  userId: string;
  submitterProfile: TemplateSubmitterProfile;
  template: TemplateItem;
  status: TemplateSubmissionStatus;
  autoReview: TemplateAutoReview;
  conformance: TemplateConformanceReport;
  reviewHistory: TemplateReviewRecord[];
  qualitySignals: TemplateQualitySignals;
  qualityScore: number;
  votes: {
    up: number;
    down: number;
  };
  submittedAtIso: string;
  decidedAtIso?: string;
}

export interface MarketplaceState {
  installedTemplateIds: string[];
  submissions: TemplateSubmission[];
  ratings: Record<string, TemplateRating>;
  templateStats: Record<string, TemplateCommunityStats>;
  reviewsByTemplateId: Record<string, TemplateUserReview[]>;
  updatedAtIso: string;
}

export interface TemplateCatalogQuery {
  kind?: TemplateKind | 'all';
  search?: string;
  category?: TemplateCategory | 'all';
  tags?: string[];
  author?: string;
}
