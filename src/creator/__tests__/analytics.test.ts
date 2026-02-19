import { beforeEach, describe, expect, it } from 'vitest';
import {
  recordMarketplaceInstallEvent,
  recordMarketplaceUninstallEvent,
  recordMarketplaceUsageEvent,
  resetMarketplaceAnalyticsForTests,
} from '../../marketplace/analytics';
import { marketplaceStore } from '../../marketplace/store';
import type {
  MarketplaceState,
  PersonaTemplate,
  TemplateSubmission,
  TemplateSubmissionStatus,
} from '../../marketplace/types';
import {
  buildCreatorAnalytics,
  getWeeklyFeaturedCreatorSpotlight,
  listFeaturedCreatorSpotlights,
} from '../analytics';

const buildPersonaTemplate = (id: string, name: string): PersonaTemplate => ({
  kind: 'persona',
  metadata: {
    id,
    name,
    description: `${name} template description with enough depth for quality scoring.`,
    category: 'creative',
    tags: ['creator', 'analytics'],
    author: 'Creator',
    version: '1.0.0',
    createdAtIso: '2026-02-01T00:00:00.000Z',
    updatedAtIso: '2026-02-01T00:00:00.000Z',
  },
  personaYaml: `version: "1.0"
core:
  name: "${name}"
  essence: "behavior communication boundaries pattern quality coverage for creator analytics tests."
`,
  summary: `${name} summary`,
});

const buildSubmission = (payload: {
  id: string;
  creatorUserId: string;
  template: PersonaTemplate;
  status?: TemplateSubmissionStatus;
  submittedAtIso?: string;
}): TemplateSubmission => ({
  id: payload.id,
  userId: 'workspace-owner',
  submitterProfile: {
    userId: payload.creatorUserId,
    displayName: payload.creatorUserId,
  },
  template: payload.template,
  status: payload.status ?? 'approved',
  autoReview: {
    passed: true,
    issues: [],
  },
  conformance: {
    passed: true,
    issues: [],
    checks: [],
    evaluatedAtIso: payload.submittedAtIso ?? '2026-02-01T00:00:00.000Z',
  },
  reviewHistory: [],
  qualitySignals: {
    validationScore: 1,
    conformanceScore: 1,
    benchmarkScore: 0.9,
    creatorScore: 0.9,
    metadataCompletenessScore: 1,
  },
  qualityScore: 0.9,
  votes: {
    up: 3,
    down: 0,
  },
  submittedAtIso: payload.submittedAtIso ?? '2026-02-01T00:00:00.000Z',
  decidedAtIso: payload.submittedAtIso ?? '2026-02-01T00:00:00.000Z',
});

const buildBaseState = (): MarketplaceState => ({
  installedTemplateIds: [],
  submissions: [],
  ratings: {},
  templateStats: {},
  reviewsByTemplateId: {},
  updatedAtIso: '2026-02-01T00:00:00.000Z',
});

describe('creator analytics', () => {
  beforeEach(() => {
    resetMarketplaceAnalyticsForTests();
  });

  it('aggregates creator metrics across five templates', () => {
    const userId = 'week64-analytics-aggregate';
    const creatorUserId = 'creator-week64-main';
    const templateIds = ['creator-template-1', 'creator-template-2', 'creator-template-3', 'creator-template-4', 'creator-template-5'];
    const templates = templateIds.map((id, index) => buildPersonaTemplate(id, `Template ${index + 1}`));
    const submissions = templates.map((template, index) =>
      buildSubmission({
        id: `submission-${index + 1}`,
        creatorUserId,
        template,
        submittedAtIso: `2026-02-0${index + 1}T00:00:00.000Z`,
      })
    );

    marketplaceStore.save(userId, {
      ...buildBaseState(),
      submissions,
      ratings: {
        'creator-template-1': { average: 5, votes: 10 },
        'creator-template-2': { average: 4, votes: 8 },
        'creator-template-3': { average: 4, votes: 6 },
        'creator-template-4': { average: 3, votes: 4 },
        'creator-template-5': { average: 5, votes: 2 },
      },
      templateStats: {
        'creator-template-1': { installCount: 120, usageCount: 42, benchmarkVerified: true },
        'creator-template-2': { installCount: 90, usageCount: 30, benchmarkVerified: true },
        'creator-template-3': { installCount: 70, usageCount: 20, benchmarkVerified: false },
        'creator-template-4': { installCount: 40, usageCount: 12, benchmarkVerified: true },
        'creator-template-5': { installCount: 30, usageCount: 9, benchmarkVerified: false },
      },
    });

    recordMarketplaceInstallEvent({
      userId: 'end-user-1',
      subjectType: 'template',
      subjectId: 'creator-template-1',
      nowIso: '2026-02-16T09:00:00.000Z',
    });
    recordMarketplaceUsageEvent({
      userId: 'end-user-1',
      subjectType: 'template',
      subjectId: 'creator-template-1',
      nowIso: '2026-02-17T09:00:00.000Z',
    });
    recordMarketplaceInstallEvent({
      userId: 'end-user-2',
      subjectType: 'template',
      subjectId: 'creator-template-1',
      nowIso: '2026-02-16T10:00:00.000Z',
    });
    recordMarketplaceUninstallEvent({
      userId: 'end-user-2',
      subjectType: 'template',
      subjectId: 'creator-template-1',
      nowIso: '2026-02-17T10:00:00.000Z',
    });
    recordMarketplaceInstallEvent({
      userId: 'end-user-2',
      subjectType: 'template',
      subjectId: 'creator-template-2',
      nowIso: '2026-02-17T11:00:00.000Z',
    });
    recordMarketplaceUsageEvent({
      userId: 'end-user-2',
      subjectType: 'template',
      subjectId: 'creator-template-2',
      nowIso: '2026-02-18T11:00:00.000Z',
    });
    recordMarketplaceInstallEvent({
      userId: 'end-user-3',
      subjectType: 'template',
      subjectId: 'creator-template-4',
      nowIso: '2026-02-18T12:00:00.000Z',
    });
    recordMarketplaceInstallEvent({
      userId: 'end-user-1',
      subjectType: 'template',
      subjectId: 'creator-template-5',
      nowIso: '2026-02-18T13:00:00.000Z',
    });

    const snapshot = buildCreatorAnalytics({
      userId,
      creatorUserId,
      nowIso: '2026-02-18T23:00:00.000Z',
    });

    expect(snapshot.templateCount).toBe(5);
    expect(snapshot.totalInstalls).toBe(350);
    expect(snapshot.activeUsers).toBe(3);
    expect(snapshot.totalRatingVotes).toBe(30);
    expect(snapshot.averageRating).toBeCloseTo(4.2667, 4);
    expect(snapshot.benchmarkComplianceRate).toBe(0.6);
    expect(snapshot.revenueReadinessScore).toBeGreaterThan(0.5);
    expect(snapshot.revenueReadinessScore).toBeLessThan(0.8);

    const votesByRating = Object.fromEntries(
      snapshot.ratingsDistribution.map((bucket) => [bucket.rating, bucket.votes])
    );
    expect(votesByRating[5]).toBe(12);
    expect(votesByRating[4]).toBe(14);
    expect(votesByRating[3]).toBe(4);
    expect(votesByRating[2]).toBe(0);
    expect(votesByRating[1]).toBe(0);
  });

  it('produces deterministic creator spotlight ranking', () => {
    const userId = 'week64-spotlight-ranking';
    const alphaTemplate = buildPersonaTemplate('alpha-template', 'Alpha');
    const betaTemplate = buildPersonaTemplate('beta-template', 'Beta');
    const gammaTemplate = buildPersonaTemplate('gamma-template', 'Gamma');

    marketplaceStore.save(userId, {
      ...buildBaseState(),
      submissions: [
        buildSubmission({
          id: 'sub-alpha',
          creatorUserId: 'creator-alpha',
          template: alphaTemplate,
        }),
        buildSubmission({
          id: 'sub-beta',
          creatorUserId: 'creator-beta',
          template: betaTemplate,
        }),
        buildSubmission({
          id: 'sub-gamma',
          creatorUserId: 'creator-gamma',
          template: gammaTemplate,
        }),
      ],
      ratings: {
        'alpha-template': { average: 4.2, votes: 10 },
        'beta-template': { average: 4.2, votes: 10 },
        'gamma-template': { average: 4.8, votes: 12 },
      },
      templateStats: {
        'alpha-template': { installCount: 120, usageCount: 18, benchmarkVerified: true },
        'beta-template': { installCount: 120, usageCount: 18, benchmarkVerified: true },
        'gamma-template': { installCount: 250, usageCount: 26, benchmarkVerified: true },
      },
    });

    const firstRun = listFeaturedCreatorSpotlights({
      userId,
      nowIso: '2026-02-18T00:00:00.000Z',
      limit: 3,
    });
    const secondRun = listFeaturedCreatorSpotlights({
      userId,
      nowIso: '2026-02-18T00:00:00.000Z',
      limit: 3,
    });

    expect(firstRun).toEqual(secondRun);
    expect(firstRun.map((entry) => entry.creatorUserId)).toEqual([
      'creator-gamma',
      'creator-alpha',
      'creator-beta',
    ]);

    const weekly = getWeeklyFeaturedCreatorSpotlight({
      userId,
      nowIso: '2026-02-18T00:00:00.000Z',
      candidateLimit: 3,
    });
    expect(weekly.candidates.length).toBe(3);
    expect(weekly.featured).not.toBeNull();
  });
});
