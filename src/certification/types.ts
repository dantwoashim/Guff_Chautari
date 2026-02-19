import type { CreatorTier } from '../creator/types';

export type CertificationLevel = 'none' | 'certified' | 'gold' | 'platinum';

export type CertificationRequirementId =
  | 'schema_compliance'
  | 'benchmark_minimum'
  | 'safety_policy_compliance'
  | 'documentation_completeness'
  | 'creator_tier_requirements';

export type CertificationSeverity = 'info' | 'warning' | 'critical';

export interface CertificationRequirement {
  id: CertificationRequirementId;
  label: string;
  description: string;
  required: boolean;
  minimumScore?: number;
  minimumCreatorTier?: CreatorTier;
}

export interface CertificationSignal {
  id: string;
  passed: boolean;
  severity: CertificationSeverity;
  message: string;
}

export interface CertificationDocumentationSignals {
  readme: boolean;
  setupGuide: boolean;
  apiReference: boolean;
  changelog: boolean;
}

export interface CertificationCreatorSignals {
  tier?: CreatorTier;
  approvedPackages?: number;
  trustScore?: number;
}

export interface CertificationCandidate {
  id: string;
  name: string;
  kind: 'template' | 'plugin' | 'vertical';
  version?: string;
  schemaValid: boolean;
  benchmarkScore?: number;
  safetySignals?: ReadonlyArray<CertificationSignal>;
  documentation: CertificationDocumentationSignals;
  creator: CertificationCreatorSignals;
}

export interface CertificationCheckResult {
  requirementId: CertificationRequirementId;
  label: string;
  passed: boolean;
  severity: CertificationSeverity;
  score?: number;
  minimumScore?: number;
  detail: string;
}

export interface CertificationResult {
  candidateId: string;
  candidateName: string;
  candidateKind: CertificationCandidate['kind'];
  certified: boolean;
  level: CertificationLevel;
  score: number;
  evaluatedAtIso: string;
  checks: CertificationCheckResult[];
  failureReasons: string[];
  warnings: string[];
}

export const CERTIFICATION_REQUIREMENTS: ReadonlyArray<CertificationRequirement> = [
  {
    id: 'schema_compliance',
    label: 'Schema compliance',
    description: 'Package schema and metadata contracts are valid.',
    required: true,
  },
  {
    id: 'benchmark_minimum',
    label: 'Benchmark minimum scores',
    description: 'Package meets minimum benchmark quality thresholds.',
    required: true,
    minimumScore: 0.7,
  },
  {
    id: 'safety_policy_compliance',
    label: 'Safety policy compliance',
    description: 'No critical safety violations are detected in conformance signals.',
    required: true,
  },
  {
    id: 'documentation_completeness',
    label: 'Documentation completeness',
    description: 'Package includes setup and operational documentation required for adoption.',
    required: true,
    minimumScore: 0.75,
  },
  {
    id: 'creator_tier_requirements',
    label: 'Creator tier requirements',
    description: 'Submitter meets minimum creator tier and trust requirements.',
    required: true,
    minimumCreatorTier: 'Contributor',
    minimumScore: 0.45,
  },
];
