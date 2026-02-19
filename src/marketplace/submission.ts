import { marketplaceStore, type MarketplaceStore } from './store';
import type {
  TemplateConformanceCheck,
  TemplateConformanceReport,
  TemplateItem,
  TemplateQualitySignals,
  TemplateSubmission,
  TemplateSubmitterProfile,
} from './types';
import { validateTemplate } from './validation';

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

const clamp01 = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return Number(value.toFixed(4));
};

const creatorTierScore = (tier: TemplateSubmitterProfile['creatorTier']): number => {
  if (tier === 'Featured') return 1;
  if (tier === 'Certified') return 0.85;
  if (tier === 'Contributor') return 0.7;
  return 0.55;
};

const metadataCompletenessScore = (template: TemplateItem): number => {
  const checks = [
    template.metadata.name.trim().length >= 3 ? 1 : 0,
    template.metadata.description.trim().length >= 24 ? 1 : 0,
    template.metadata.tags.length >= 2 ? 1 : 0,
    template.metadata.author.trim().length >= 2 ? 1 : 0,
    /^(\d+)\.(\d+)\.(\d+)$/.test(template.metadata.version) ? 1 : 0,
  ];

  return clamp01(checks.reduce((sum, item) => sum + item, 0) / checks.length);
};

const buildConformanceChecks = (template: TemplateItem): TemplateConformanceCheck[] => {
  const checks: TemplateConformanceCheck[] = [];

  const idFormatPass = /^[a-z0-9-]+$/.test(template.metadata.id);
  checks.push({
    id: 'id_format',
    passed: idFormatPass,
    severity: 'critical',
    message: idFormatPass
      ? 'Template id format is valid.'
      : 'Template id should be lowercase kebab-case.',
  });

  const descriptionPass = template.metadata.description.trim().length >= 24;
  checks.push({
    id: 'description_depth',
    passed: descriptionPass,
    severity: descriptionPass ? 'info' : 'warning',
    message: descriptionPass
      ? 'Template description includes enough implementation detail.'
      : 'Template description should be at least 24 characters.',
  });

  const tagsPass = template.metadata.tags.length >= 2;
  checks.push({
    id: 'tag_depth',
    passed: tagsPass,
    severity: tagsPass ? 'info' : 'warning',
    message: tagsPass
      ? 'Template has enough tags for discovery.'
      : 'Template should include at least two tags.',
  });

  const benchmarkPass =
    template.kind === 'persona'
      ? template.personaYaml.length >= 120 &&
        /communication|behavior|boundaries/i.test(template.personaYaml)
      : template.steps.length >= 3;
  checks.push({
    id: 'persona_drift_benchmark',
    passed: benchmarkPass,
    severity: benchmarkPass ? 'info' : 'warning',
    message: benchmarkPass
      ? 'Template passes baseline drift conformance heuristic.'
      : 'Template should provide stronger persona/workflow structure for drift stability.',
  });

  const workflowConnectorPass =
    template.kind === 'workflow'
      ? template.connectorRequirements.every((connector) =>
          template.steps.some((step) => step.actionId.includes(`connector.${connector}.`))
        )
      : true;
  checks.push({
    id: 'connector_coverage',
    passed: workflowConnectorPass,
    severity: workflowConnectorPass ? 'info' : 'warning',
    message: workflowConnectorPass
      ? 'Connector requirements are represented in steps.'
      : 'Workflow connector requirements are not reflected in workflow steps.',
  });

  return checks;
};

export const runTemplateConformanceChecks = (
  template: TemplateItem,
  nowIso = new Date().toISOString()
): TemplateConformanceReport => {
  const checks = buildConformanceChecks(template);
  const issues = checks.filter((check) => !check.passed).map((check) => check.message);
  const hasCriticalFailure = checks.some((check) => !check.passed && check.severity === 'critical');

  return {
    passed: !hasCriticalFailure,
    issues,
    checks,
    evaluatedAtIso: nowIso,
  };
};

export const scoreTemplateQuality = (payload: {
  template: TemplateItem;
  validationPassed: boolean;
  conformance: TemplateConformanceReport;
  submitterProfile: TemplateSubmitterProfile;
}): {
  qualitySignals: TemplateQualitySignals;
  qualityScore: number;
  personaDriftScore: number;
  benchmarkVerified: boolean;
} => {
  const conformancePassedRatio =
    payload.conformance.checks.length === 0
      ? 0
      : payload.conformance.checks.filter((check) => check.passed).length /
        payload.conformance.checks.length;
  const benchmarkCheck = payload.conformance.checks.find(
    (check) => check.id === 'persona_drift_benchmark'
  );
  const benchmarkScore = benchmarkCheck?.passed ? 0.9 : 0.45;
  const personaDriftScore = benchmarkCheck?.passed ? 0.83 : 0.48;

  const qualitySignals: TemplateQualitySignals = {
    validationScore: payload.validationPassed ? 1 : 0.2,
    conformanceScore: clamp01(conformancePassedRatio),
    benchmarkScore: clamp01(benchmarkScore),
    creatorScore: clamp01(creatorTierScore(payload.submitterProfile.creatorTier)),
    metadataCompletenessScore: metadataCompletenessScore(payload.template),
  };

  const qualityScore = clamp01(
    qualitySignals.validationScore * 0.28 +
      qualitySignals.conformanceScore * 0.3 +
      qualitySignals.benchmarkScore * 0.18 +
      qualitySignals.creatorScore * 0.12 +
      qualitySignals.metadataCompletenessScore * 0.12
  );

  return {
    qualitySignals,
    qualityScore,
    personaDriftScore: clamp01(personaDriftScore),
    benchmarkVerified: benchmarkCheck?.passed ?? false,
  };
};

const normalizeSubmitterProfile = (
  userId: string,
  template: TemplateItem,
  submitterProfile?: Partial<TemplateSubmitterProfile>
): TemplateSubmitterProfile => {
  return {
    userId: submitterProfile?.userId?.trim() || userId,
    displayName: submitterProfile?.displayName?.trim() || template.metadata.author || 'Community Creator',
    creatorTier: submitterProfile?.creatorTier,
    benchmarkBadgeTier: submitterProfile?.benchmarkBadgeTier ?? null,
  };
};

export const submitTemplateForReview = (
  payload: {
    userId: string;
    template: TemplateItem;
    submitterProfile?: Partial<TemplateSubmitterProfile>;
    nowIso?: string;
  },
  store: MarketplaceStore = marketplaceStore
): TemplateSubmission => {
  const nowIso = payload.nowIso ?? new Date().toISOString();
  const submitterProfile = normalizeSubmitterProfile(
    payload.userId,
    payload.template,
    payload.submitterProfile
  );
  const validation = validateTemplate(payload.template);
  const conformance = runTemplateConformanceChecks(payload.template, nowIso);
  const { qualitySignals, qualityScore, personaDriftScore, benchmarkVerified } = scoreTemplateQuality({
    template: payload.template,
    validationPassed: validation.ok,
    conformance,
    submitterProfile,
  });

  let status: TemplateSubmission['status'];
  if (!validation.ok) {
    status = 'rejected';
  } else if (!conformance.passed) {
    status = 'changes_requested';
  } else {
    status = 'community_review';
  }

  const submission: TemplateSubmission = {
    id: makeId('template-submission'),
    userId: payload.userId,
    submitterProfile,
    template: payload.template,
    status,
    autoReview: {
      passed: validation.ok && conformance.passed,
      issues: [...validation.issues, ...conformance.issues],
    },
    conformance,
    reviewHistory: [],
    qualitySignals,
    qualityScore,
    votes: {
      up: 0,
      down: 0,
    },
    submittedAtIso: nowIso,
    decidedAtIso: status === 'community_review' ? undefined : nowIso,
  };

  store.update(payload.userId, (state) => {
    const templateId = payload.template.metadata.id;
    const existingStats = state.templateStats[templateId] ?? {
      installCount: 0,
      usageCount: 0,
    };

    return {
      ...state,
      submissions: [submission, ...state.submissions.filter((entry) => entry.id !== submission.id)],
      templateStats: {
        ...state.templateStats,
        [templateId]: {
          ...existingStats,
          personaDriftScore,
          benchmarkVerified,
          creatorCertified:
            existingStats.creatorCertified ||
            submitterProfile.creatorTier === 'Certified' ||
            submitterProfile.creatorTier === 'Featured',
        },
      },
    };
  });

  return submission;
};
