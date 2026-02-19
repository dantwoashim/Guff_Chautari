import type { CreatorTier } from '../creator/types';
import {
  CERTIFICATION_REQUIREMENTS,
  type CertificationCandidate,
  type CertificationCheckResult,
  type CertificationLevel,
  type CertificationRequirement,
  type CertificationResult,
  type CertificationSeverity,
} from './types';

const clamp01 = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return Number(value.toFixed(4));
};

const CREATOR_TIER_ORDER: Record<CreatorTier, number> = {
  Contributor: 1,
  Certified: 2,
  Featured: 3,
};

const compareCreatorTier = (
  current?: CreatorTier,
  minimum?: CreatorTier
): boolean => {
  if (!minimum) return true;
  if (!current) return false;
  return CREATOR_TIER_ORDER[current] >= CREATOR_TIER_ORDER[minimum];
};

const documentationScore = (candidate: CertificationCandidate): number => {
  const fields = [
    candidate.documentation.readme,
    candidate.documentation.setupGuide,
    candidate.documentation.apiReference,
    candidate.documentation.changelog,
  ];

  const passed = fields.filter(Boolean).length;
  return clamp01(passed / fields.length);
};

const benchmarkScore = (candidate: CertificationCandidate): number => {
  return clamp01(candidate.benchmarkScore ?? 0);
};

const creatorScore = (candidate: CertificationCandidate): number => {
  const tierScore = candidate.creator.tier ? CREATOR_TIER_ORDER[candidate.creator.tier] / 3 : 0;
  const trustScore = clamp01(candidate.creator.trustScore ?? 0.4);
  const approvedPackages = Math.max(0, candidate.creator.approvedPackages ?? 0);
  const volumeScore = clamp01(approvedPackages / 6);

  return clamp01(tierScore * 0.5 + trustScore * 0.35 + volumeScore * 0.15);
};

const safetyEvaluation = (candidate: CertificationCandidate): {
  passed: boolean;
  severity: CertificationSeverity;
  detail: string;
} => {
  const signals = candidate.safetySignals ?? [];
  if (signals.length === 0) {
    return {
      passed: true,
      severity: 'warning',
      detail: 'No explicit safety signals provided; fallback passing with warning.',
    };
  }

  const criticalFailures = signals.filter((signal) => !signal.passed && signal.severity === 'critical');
  if (criticalFailures.length > 0) {
    return {
      passed: false,
      severity: 'critical',
      detail: `Critical safety failures: ${criticalFailures.map((failure) => failure.message).join('; ')}`,
    };
  }

  const warningFailures = signals.filter((signal) => !signal.passed);
  if (warningFailures.length > 0) {
    return {
      passed: true,
      severity: 'warning',
      detail: `Non-critical safety warnings: ${warningFailures
        .map((failure) => failure.message)
        .join('; ')}`,
    };
  }

  return {
    passed: true,
    severity: 'info',
    detail: 'Safety signals passed.',
  };
};

const requirementForId = (id: CertificationRequirement['id']): CertificationRequirement => {
  return CERTIFICATION_REQUIREMENTS.find((requirement) => requirement.id === id) as CertificationRequirement;
};

const evaluateRequirement = (
  candidate: CertificationCandidate,
  requirement: CertificationRequirement
): CertificationCheckResult => {
  if (requirement.id === 'schema_compliance') {
    const passed =
      candidate.schemaValid &&
      candidate.name.trim().length >= 3 &&
      candidate.id.trim().length >= 3 &&
      Boolean(candidate.version && candidate.version.trim().length > 0);

    return {
      requirementId: requirement.id,
      label: requirement.label,
      passed,
      severity: passed ? 'info' : 'critical',
      detail: passed
        ? 'Schema and identity fields are valid.'
        : 'Missing or invalid schema fields (name/id/version/schema).',
    };
  }

  if (requirement.id === 'benchmark_minimum') {
    const score = benchmarkScore(candidate);
    const minimumScore = clamp01(requirement.minimumScore ?? 0.7);
    const passed = score >= minimumScore;
    return {
      requirementId: requirement.id,
      label: requirement.label,
      passed,
      severity: passed ? 'info' : 'critical',
      score,
      minimumScore,
      detail: passed
        ? `Benchmark score ${score} meets minimum ${minimumScore}.`
        : `Benchmark score ${score} is below minimum ${minimumScore}.`,
    };
  }

  if (requirement.id === 'safety_policy_compliance') {
    const safety = safetyEvaluation(candidate);
    return {
      requirementId: requirement.id,
      label: requirement.label,
      passed: safety.passed,
      severity: safety.severity,
      detail: safety.detail,
    };
  }

  if (requirement.id === 'documentation_completeness') {
    const score = documentationScore(candidate);
    const minimumScore = clamp01(requirement.minimumScore ?? 0.75);
    const passed = score >= minimumScore;

    return {
      requirementId: requirement.id,
      label: requirement.label,
      passed,
      severity: passed ? 'info' : 'warning',
      score,
      minimumScore,
      detail: passed
        ? `Documentation completeness ${score} meets minimum ${minimumScore}.`
        : `Documentation completeness ${score} is below minimum ${minimumScore}.`,
    };
  }

  if (requirement.id === 'creator_tier_requirements') {
    const score = creatorScore(candidate);
    const minimumScore = clamp01(requirement.minimumScore ?? 0.45);
    const tierPass = compareCreatorTier(candidate.creator.tier, requirement.minimumCreatorTier);
    const passed = tierPass && score >= minimumScore;

    return {
      requirementId: requirement.id,
      label: requirement.label,
      passed,
      severity: passed ? 'info' : 'warning',
      score,
      minimumScore,
      detail: passed
        ? `Creator tier ${candidate.creator.tier ?? 'n/a'} and score ${score} meet requirements.`
        : `Creator tier/score are below requirements (tier=${candidate.creator.tier ?? 'n/a'}, score=${score}).`,
    };
  }

  return {
    requirementId: requirement.id,
    label: requirement.label,
    passed: false,
    severity: 'critical',
    detail: 'Unsupported certification requirement.',
  };
};

const deriveCertificationLevel = (payload: {
  certified: boolean;
  score: number;
  benchmarkScore: number;
  creatorTier?: CreatorTier;
}): CertificationLevel => {
  if (!payload.certified) return 'none';

  if (
    payload.score >= 0.9 &&
    payload.benchmarkScore >= 0.85 &&
    payload.creatorTier === 'Featured'
  ) {
    return 'platinum';
  }

  if (
    payload.score >= 0.8 &&
    payload.benchmarkScore >= 0.78 &&
    (payload.creatorTier === 'Certified' || payload.creatorTier === 'Featured')
  ) {
    return 'gold';
  }

  return 'certified';
};

export const evaluateCertificationCandidate = (
  candidate: CertificationCandidate,
  options: {
    nowIso?: string;
    requirements?: ReadonlyArray<CertificationRequirement>;
  } = {}
): CertificationResult => {
  const nowIso = options.nowIso ?? new Date().toISOString();
  const requirements = options.requirements ?? CERTIFICATION_REQUIREMENTS;

  const checks = requirements.map((requirement) => evaluateRequirement(candidate, requirement));
  const requiredFailures = checks.filter(
    (check) => !check.passed && requirementForId(check.requirementId).required
  );
  const warnings = checks
    .filter((check) => check.severity === 'warning')
    .map((check) => check.detail);

  const checkPassScore =
    checks.length === 0 ? 0 : checks.filter((check) => check.passed).length / checks.length;
  const overallScore = clamp01(
    checkPassScore * 0.45 +
      benchmarkScore(candidate) * 0.3 +
      documentationScore(candidate) * 0.15 +
      creatorScore(candidate) * 0.1
  );

  const certified = requiredFailures.length === 0;
  const level = deriveCertificationLevel({
    certified,
    score: overallScore,
    benchmarkScore: benchmarkScore(candidate),
    creatorTier: candidate.creator.tier,
  });

  return {
    candidateId: candidate.id,
    candidateName: candidate.name,
    candidateKind: candidate.kind,
    certified,
    level,
    score: overallScore,
    evaluatedAtIso: nowIso,
    checks,
    failureReasons: requiredFailures.map((failure) => failure.detail),
    warnings,
  };
};
