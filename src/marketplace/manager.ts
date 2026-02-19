import type { Workflow } from '../workflows';
import { workflowEngine } from '../workflows';
import {
  evaluateCertificationCandidate,
  type CertificationCandidate,
  type CertificationResult,
} from '../certification';
import {
  curatedTemplates,
  filterTemplateCatalog,
  mergeTemplateCatalog,
  sortTemplateCatalog,
} from './catalog';
import {
  recordMarketplaceInstallEvent,
  recordMarketplaceUsageEvent,
  recordMarketplaceUninstallEvent,
} from './analytics';
import { listRegistryActiveTemplates } from './registry';
import { computeTemplateBadges, type TemplateBadge } from './badges';
import { marketplaceStore } from './store';
import { submitTemplateForReview } from './submission';
import { reviewTemplateSubmission } from './submissionReview';
import type {
  TemplateCatalogQuery,
  TemplateCommunityStats,
  TemplateItem,
  TemplateRating,
  TemplateSubmission,
  TemplateSubmissionStatus,
  TemplateSubmitterProfile,
  TemplateUserReview,
  WorkflowTemplate,
} from './types';
import { validateTemplate } from './validation';

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

const unique = <T>(values: ReadonlyArray<T>): T[] => [...new Set(values)];

const nextScheduleIso = (nowIso: string): string => {
  const now = new Date(nowIso);
  const next = new Date(now.getTime());
  next.setHours(9, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.toISOString();
};

const toWorkflow = (userId: string, template: WorkflowTemplate, nowIso: string): Workflow => {
  return {
    id: makeId(`workflow-template-${template.metadata.id}`),
    userId,
    name: template.metadata.name,
    description: template.metadata.description,
    naturalLanguagePrompt: template.naturalLanguagePrompt,
    trigger:
      template.triggerType === 'schedule'
        ? {
            id: makeId('trigger'),
            type: 'schedule',
            enabled: true,
            schedule: {
              intervalMinutes: 24 * 60,
              nextRunAtIso: nextScheduleIso(nowIso),
              cronLike: 'DAILY@09:00',
            },
          }
        : template.triggerType === 'event'
          ? {
              id: makeId('trigger'),
              type: 'event',
              enabled: true,
              event: {
                eventType: 'new_message',
              },
            }
          : {
              id: makeId('trigger'),
              type: 'manual',
              enabled: true,
            },
    steps: template.steps.map((step) => ({
      id: `${step.id}-${makeId('step')}`,
      title: step.title,
      description: step.description,
      kind: step.kind,
      actionId: step.actionId,
      inputTemplate: step.inputTemplate,
      status: 'idle',
    })),
    status: 'ready',
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };
};

const getApprovedSubmissions = (userId: string): TemplateSubmission[] => {
  return marketplaceStore
    .load(userId)
    .submissions.filter((submission) => submission.status === 'approved');
};

const featuredTemplateIdsForUser = (userId: string): ReadonlySet<string> => {
  const state = marketplaceStore.load(userId);
  const featuredIds = new Set<string>(
    curatedTemplates.filter((template) => template.metadata.featured).map((template) => template.metadata.id)
  );

  for (const submission of state.submissions) {
    if (
      submission.status === 'approved' &&
      (submission.template.metadata.featured || submission.submitterProfile.creatorTier === 'Featured')
    ) {
      featuredIds.add(submission.template.metadata.id);
    }
  }
  return featuredIds;
};

const certifiedTemplateIdsForUser = (userId: string): ReadonlySet<string> => {
  const state = marketplaceStore.load(userId);
  const certifiedIds = new Set<string>();

  for (const [templateId, stats] of Object.entries(state.templateStats)) {
    if (stats?.ashimCertified) {
      certifiedIds.add(templateId);
    }
  }

  return certifiedIds;
};

const mapTemplateDocumentationSignals = (
  template: TemplateItem
): CertificationCandidate['documentation'] => {
  if (template.kind === 'workflow') {
    return {
      readme: template.metadata.description.trim().length >= 24,
      setupGuide: template.steps.length >= 3,
      apiReference:
        template.steps.some((step) => step.actionId.startsWith('connector.')) ||
        template.connectorRequirements.length > 0,
      changelog: /^(\d+)\.(\d+)\.(\d+)$/.test(template.metadata.version),
    };
  }

  return {
    readme: template.metadata.description.trim().length >= 24,
    setupGuide: template.personaYaml.trim().length >= 120,
    apiReference: /communication|behavior|boundaries/i.test(template.personaYaml),
    changelog: /^(\d+)\.(\d+)\.(\d+)$/.test(template.metadata.version),
  };
};

const mapSubmissionToCertificationCandidate = (payload: {
  submission: TemplateSubmission;
  approvedByCreatorCount: number;
}): CertificationCandidate => {
  const safetySignals: CertificationCandidate['safetySignals'] = payload.submission.conformance.checks.map(
    (check) => {
      const severity: 'info' | 'warning' | 'critical' =
        check.severity === 'critical'
          ? 'critical'
          : check.severity === 'warning'
            ? 'warning'
            : 'info';

      return {
        id: check.id,
        passed: check.passed,
        severity,
        message: check.message,
      };
    }
  );

  return {
    id: payload.submission.template.metadata.id,
    name: payload.submission.template.metadata.name,
    kind: 'template',
    version: payload.submission.template.metadata.version,
    schemaValid: payload.submission.autoReview.passed && payload.submission.conformance.passed,
    benchmarkScore: payload.submission.qualitySignals.benchmarkScore,
    safetySignals,
    documentation: mapTemplateDocumentationSignals(payload.submission.template),
    creator: {
      tier: payload.submission.submitterProfile.creatorTier,
      approvedPackages: payload.approvedByCreatorCount,
      trustScore: payload.submission.qualityScore,
    },
  };
};

const applySubmissionCertification = (payload: {
  userId: string;
  submission: TemplateSubmission;
  nowIso: string;
}): CertificationResult => {
  const state = marketplaceStore.load(payload.userId);
  const approvedByCreatorCount = state.submissions.filter(
    (submission) =>
      submission.submitterProfile.userId === payload.submission.submitterProfile.userId &&
      submission.status === 'approved'
  ).length;

  const candidate = mapSubmissionToCertificationCandidate({
    submission: payload.submission,
    approvedByCreatorCount,
  });
  const certification = evaluateCertificationCandidate(candidate, {
    nowIso: payload.nowIso,
  });

  marketplaceStore.update(payload.userId, (current) => {
    const existingStats = current.templateStats[payload.submission.template.metadata.id] ?? {
      installCount: 0,
      usageCount: 0,
    };

    return {
      ...current,
      templateStats: {
        ...current.templateStats,
        [payload.submission.template.metadata.id]: {
          ...existingStats,
          ashimCertified: certification.certified,
          certificationLevel: certification.level,
          certificationScore: certification.score,
          certificationUpdatedAtIso: certification.evaluatedAtIso,
        },
      },
    };
  });

  return certification;
};

const buildTemplateUniverse = (userId: string): TemplateItem[] => {
  const approvedSubmissions = getApprovedSubmissions(userId).map((submission) => submission.template);
  const registryTemplates = listRegistryActiveTemplates();
  return mergeTemplateCatalog({
    curated: curatedTemplates,
    communityApproved: [...approvedSubmissions, ...registryTemplates],
  });
};

const normalizeAuthor = (author?: string): string | undefined => {
  const normalized = author?.trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
};

const normalizeTags = (tags?: string[]): string[] | undefined => {
  if (!tags || tags.length === 0) return undefined;
  const normalized = tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0);
  return normalized.length > 0 ? normalized : undefined;
};

export const listCuratedTemplates = (): TemplateItem[] => {
  return sortTemplateCatalog(curatedTemplates);
};

export const listTemplates = (payload: {
  userId: string;
  kind?: TemplateCatalogQuery['kind'];
  search?: string;
  category?: TemplateCatalogQuery['category'];
  tags?: string[];
  author?: string;
}): TemplateItem[] => {
  const state = marketplaceStore.load(payload.userId);
  const allTemplates = buildTemplateUniverse(payload.userId);
  const filtered = filterTemplateCatalog(allTemplates, {
    kind: payload.kind ?? 'all',
    search: payload.search,
    category: payload.category ?? 'all',
    tags: normalizeTags(payload.tags),
    author: normalizeAuthor(payload.author),
  });

  return sortTemplateCatalog(filtered, {
    ratings: state.ratings,
    featuredTemplateIds: featuredTemplateIdsForUser(payload.userId),
    certifiedTemplateIds: certifiedTemplateIdsForUser(payload.userId),
  });
};

export const listMarketplaceAuthors = (userId: string): string[] => {
  return unique(
    buildTemplateUniverse(userId)
      .map((template) => template.metadata.author)
      .filter((author) => author.trim().length > 0)
  ).sort((left, right) => left.localeCompare(right));
};

export const listMarketplaceTags = (userId: string): string[] => {
  return unique(buildTemplateUniverse(userId).flatMap((template) => template.metadata.tags))
    .filter((tag) => tag.trim().length > 0)
    .sort((left, right) => left.localeCompare(right));
};

export const getTemplateById = (payload: {
  userId: string;
  templateId: string;
}): TemplateItem | null => {
  return (
    listTemplates({
      userId: payload.userId,
      kind: 'all',
    }).find((template) => template.metadata.id === payload.templateId) ?? null
  );
};

export const listInstalledTemplateIds = (userId: string): string[] => {
  return marketplaceStore.load(userId).installedTemplateIds;
};

export const getTemplateCommunityStats = (payload: {
  userId: string;
  templateId: string;
}): TemplateCommunityStats | null => {
  const stats = marketplaceStore.load(payload.userId).templateStats[payload.templateId];
  return stats ?? null;
};

export const installTemplate = (payload: {
  userId: string;
  templateId: string;
  workspaceId?: string;
  workspaceProfileKey?: string;
  nowIso?: string;
}): { ok: boolean; summary: string; installedWorkflowId?: string } => {
  const template = getTemplateById(payload);
  if (!template) {
    return {
      ok: false,
      summary: `Template "${payload.templateId}" not found.`,
    };
  }

  const nowIso = payload.nowIso ?? new Date().toISOString();
  let installedWorkflowId: string | undefined;

  if (template.kind === 'workflow') {
    const workflow = toWorkflow(payload.userId, template, nowIso);
    workflowEngine.saveWorkflow(payload.userId, workflow);
    installedWorkflowId = workflow.id;
  }

  const approvedSubmission = getApprovedSubmissions(payload.userId).find(
    (submission) => submission.template.metadata.id === template.metadata.id
  );

  marketplaceStore.update(payload.userId, (state) => {
    const existingStats = state.templateStats[template.metadata.id] ?? {
      installCount: 0,
      usageCount: 0,
    };

    return {
      ...state,
      installedTemplateIds: unique([...state.installedTemplateIds, template.metadata.id]),
      templateStats: {
        ...state.templateStats,
        [template.metadata.id]: {
          ...existingStats,
          installCount: existingStats.installCount + 1,
          usageCount: existingStats.usageCount,
          lastInstalledAtIso: nowIso,
          autoConfiguredAtIso: nowIso,
          creatorCertified:
            existingStats.creatorCertified ||
            approvedSubmission?.submitterProfile.creatorTier === 'Certified' ||
            approvedSubmission?.submitterProfile.creatorTier === 'Featured',
          benchmarkVerified:
            existingStats.benchmarkVerified ||
            approvedSubmission?.conformance.checks.some(
              (check) => check.id === 'persona_drift_benchmark' && check.passed
            ),
        },
      },
    };
  });

  recordMarketplaceInstallEvent({
    userId: payload.userId,
    subjectType: 'template',
    subjectId: template.metadata.id,
    workspaceId: payload.workspaceId,
    workspaceProfileKey: payload.workspaceProfileKey,
    nowIso,
  });

  return {
    ok: true,
    summary:
      template.kind === 'workflow'
        ? `${template.metadata.name} installed, auto-configured, and created as workflow ${installedWorkflowId}.`
        : `${template.metadata.name} installed and auto-configured in your workspace.`,
    installedWorkflowId,
  };
};

export const recordTemplateUsage = (payload: {
  userId: string;
  templateId: string;
  incrementBy?: number;
  workspaceId?: string;
  workspaceProfileKey?: string;
  nowIso?: string;
}): TemplateCommunityStats => {
  const template = getTemplateById({
    userId: payload.userId,
    templateId: payload.templateId,
  });
  if (!template) {
    throw new Error(`Template "${payload.templateId}" not found.`);
  }

  const incrementBy = Math.max(1, payload.incrementBy ?? 1);
  const nowIso = payload.nowIso ?? new Date().toISOString();
  let nextStats: TemplateCommunityStats = {
    installCount: 0,
    usageCount: 0,
  };

  marketplaceStore.update(payload.userId, (state) => {
    if (!state.installedTemplateIds.includes(payload.templateId)) {
      throw new Error('Install this template before recording usage.');
    }

    const existingStats = state.templateStats[payload.templateId] ?? {
      installCount: 0,
      usageCount: 0,
    };

    nextStats = {
      ...existingStats,
      usageCount: existingStats.usageCount + incrementBy,
      lastInstalledAtIso: existingStats.lastInstalledAtIso ?? nowIso,
    };

    return {
      ...state,
      templateStats: {
        ...state.templateStats,
        [payload.templateId]: nextStats,
      },
    };
  });

  for (let index = 0; index < incrementBy; index += 1) {
    recordMarketplaceUsageEvent({
      userId: payload.userId,
      subjectType: 'template',
      subjectId: payload.templateId,
      workspaceId: payload.workspaceId,
      workspaceProfileKey: payload.workspaceProfileKey,
      nowIso,
    });
  }

  return nextStats;
};

export const uninstallTemplate = (payload: {
  userId: string;
  templateId: string;
  workspaceId?: string;
  workspaceProfileKey?: string;
  nowIso?: string;
}): { ok: boolean; summary: string } => {
  const template = getTemplateById({
    userId: payload.userId,
    templateId: payload.templateId,
  });
  if (!template) {
    return {
      ok: false,
      summary: `Template "${payload.templateId}" not found.`,
    };
  }

  const nowIso = payload.nowIso ?? new Date().toISOString();
  let removed = false;
  marketplaceStore.update(payload.userId, (state) => {
    if (!state.installedTemplateIds.includes(payload.templateId)) {
      return state;
    }
    removed = true;
    return {
      ...state,
      installedTemplateIds: state.installedTemplateIds.filter((id) => id !== payload.templateId),
    };
  });

  if (!removed) {
    return {
      ok: false,
      summary: `${template.metadata.name} is not currently installed.`,
    };
  }

  recordMarketplaceUninstallEvent({
    userId: payload.userId,
    subjectType: 'template',
    subjectId: payload.templateId,
    workspaceId: payload.workspaceId,
    workspaceProfileKey: payload.workspaceProfileKey,
    nowIso,
  });

  return {
    ok: true,
    summary: `${template.metadata.name} was removed from installed templates.`,
  };
};

export const exportTemplatePackage = (template: TemplateItem): string => {
  return JSON.stringify(template, null, 2);
};

export const importTemplatePackage = (raw: string): TemplateItem => {
  const parsed = JSON.parse(raw) as TemplateItem;
  const validation = validateTemplate(parsed);
  if (!validation.ok) {
    throw new Error(`Invalid template package: ${validation.issues.join('; ')}`);
  }
  return parsed;
};

export const submitTemplateContribution = (payload: {
  userId: string;
  template: TemplateItem;
  submitterProfile?: Partial<TemplateSubmitterProfile>;
}): TemplateSubmission => {
  return submitTemplateForReview({
    userId: payload.userId,
    template: payload.template,
    submitterProfile: payload.submitterProfile,
  });
};

export const listTemplateSubmissions = (payload: {
  userId: string;
  status?: TemplateSubmissionStatus;
}): TemplateSubmission[] => {
  const submissions = marketplaceStore.load(payload.userId).submissions;
  const filtered = payload.status
    ? submissions.filter((submission) => submission.status === payload.status)
    : submissions;
  return [...filtered].sort(
    (left, right) => Date.parse(right.submittedAtIso) - Date.parse(left.submittedAtIso)
  );
};

export const reviewTemplateSubmissionDecision = (payload: {
  userId: string;
  submissionId: string;
  reviewerId: string;
  decision: 'approve' | 'request_changes' | 'reject';
  notes?: string;
  qualityScoreDelta?: number;
  nowIso?: string;
}): TemplateSubmission => {
  const reviewed = reviewTemplateSubmission({
    ...payload,
  });

  if (reviewed.status === 'approved') {
    applySubmissionCertification({
      userId: payload.userId,
      submission: reviewed,
      nowIso: payload.nowIso ?? new Date().toISOString(),
    });
  }

  return reviewed;
};

export const voteOnSubmission = (payload: {
  userId: string;
  submissionId: string;
  vote: 'up' | 'down';
}): TemplateSubmission => {
  let updated: TemplateSubmission | null = null;
  const nowIso = new Date().toISOString();

  marketplaceStore.update(payload.userId, (state) => {
    const nextSubmissions = state.submissions.map((submission) => {
      if (submission.id !== payload.submissionId) return submission;

      const nextVotes = {
        up: submission.votes.up + (payload.vote === 'up' ? 1 : 0),
        down: submission.votes.down + (payload.vote === 'down' ? 1 : 0),
      };

      const nextSubmission: TemplateSubmission = {
        ...submission,
        votes: nextVotes,
      };
      updated = nextSubmission;
      return nextSubmission;
    });

    return {
      ...state,
      submissions: nextSubmissions,
    };
  });

  if (!updated) {
    throw new Error(`Submission ${payload.submissionId} not found.`);
  }

  const totalVotes = updated.votes.up + updated.votes.down;
  const upRatio = totalVotes === 0 ? 0 : updated.votes.up / totalVotes;

  if (updated.status === 'community_review' && totalVotes >= 3) {
    return reviewTemplateSubmissionDecision({
      userId: payload.userId,
      submissionId: payload.submissionId,
      reviewerId: 'community-moderator',
      decision: upRatio >= 0.67 ? 'approve' : 'request_changes',
      notes:
        upRatio >= 0.67
          ? 'Auto-approved from strong community vote.'
          : 'Community vote indicates more refinement is needed.',
      nowIso,
      qualityScoreDelta: upRatio >= 0.67 ? 0.05 : -0.04,
    });
  }

  return updated;
};

export const rateTemplate = (payload: {
  userId: string;
  templateId: string;
  score: number;
  reviewText?: string;
}): TemplateRating => {
  const template = getTemplateById({
    userId: payload.userId,
    templateId: payload.templateId,
  });
  if (!template) {
    throw new Error(`Template "${payload.templateId}" not found.`);
  }

  const score = Math.max(1, Math.min(5, Math.round(payload.score)));
  const reviewText = payload.reviewText?.trim();
  let rating: TemplateRating = { average: score, votes: 1 };
  let usageCountAtReview = 0;
  const nowIso = new Date().toISOString();

  marketplaceStore.update(payload.userId, (state) => {
    if (!state.installedTemplateIds.includes(payload.templateId)) {
      throw new Error('Install this template before rating it.');
    }

    const existingStats = state.templateStats[payload.templateId] ?? {
      installCount: 0,
      usageCount: 0,
    };
    usageCountAtReview = existingStats.usageCount;
    if (usageCountAtReview < 3) {
      throw new Error('You can rate this template after at least 3 uses.');
    }

    const current = state.ratings[payload.templateId];
    if (!current) {
      rating = { average: score, votes: 1 };
    } else {
      const nextVotes = current.votes + 1;
      const nextAverage = (current.average * current.votes + score) / nextVotes;
      rating = {
        average: Number(nextAverage.toFixed(2)),
        votes: nextVotes,
      };
    }
    const existingReviews = state.reviewsByTemplateId[payload.templateId] ?? [];
    const nextReviews = reviewText
      ? [
          ...existingReviews,
          {
            id: makeId('template-review'),
            userId: payload.userId,
            score,
            text: reviewText,
            createdAtIso: nowIso,
            usageCountAtReview,
          } satisfies TemplateUserReview,
        ]
      : existingReviews;

    return {
      ...state,
      ratings: {
        ...state.ratings,
        [payload.templateId]: rating,
      },
      templateStats: {
        ...state.templateStats,
        [payload.templateId]: existingStats,
      },
      reviewsByTemplateId: {
        ...state.reviewsByTemplateId,
        [payload.templateId]: nextReviews,
      },
    };
  });

  return rating;
};

export const getTemplateRating = (payload: {
  userId: string;
  templateId: string;
}): TemplateRating | null => {
  const rating = marketplaceStore.load(payload.userId).ratings[payload.templateId];
  return rating ?? null;
};

export const listTemplateReviews = (payload: {
  userId: string;
  templateId: string;
  limit?: number;
}): TemplateUserReview[] => {
  const limit = Math.max(1, payload.limit ?? 12);
  const reviews = marketplaceStore.load(payload.userId).reviewsByTemplateId[payload.templateId] ?? [];
  return [...reviews]
    .sort((left, right) => Date.parse(right.createdAtIso) - Date.parse(left.createdAtIso))
    .slice(0, limit);
};

export const getTemplateBadges = (payload: {
  userId: string;
  templateId: string;
  favoriteInstallThreshold?: number;
}): TemplateBadge[] => {
  const template = getTemplateById({
    userId: payload.userId,
    templateId: payload.templateId,
  });
  if (!template) return [];

  const state = marketplaceStore.load(payload.userId);
  const submission =
    state.submissions.find(
      (entry) => entry.template.metadata.id === payload.templateId && entry.status === 'approved'
    ) ??
    state.submissions.find((entry) => entry.template.metadata.id === payload.templateId) ??
    null;
  const stats = state.templateStats[payload.templateId];

  return computeTemplateBadges({
    template,
    submission,
    stats,
    favoriteInstallThreshold: payload.favoriteInstallThreshold,
  });
};
