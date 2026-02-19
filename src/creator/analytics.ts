import { listMarketplaceAnalyticsEvents } from '../marketplace/analytics';
import { marketplaceStore } from '../marketplace/store';
import type { MarketplaceState, TemplateSubmission } from '../marketplace/types';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const toMs = (iso: string): number => {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const round = (value: number, decimals = 4): number => Number(value.toFixed(decimals));

const average = (values: ReadonlyArray<number>): number => {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const withinWindow = (createdAtIso: string, nowIso: string, windowDays: number): boolean => {
  const age = toMs(nowIso) - toMs(createdAtIso);
  if (age < 0) return true;
  return age <= Math.max(1, windowDays) * DAY_MS;
};

const byLatestSubmission = (left: TemplateSubmission, right: TemplateSubmission): number =>
  toMs(right.submittedAtIso) - toMs(left.submittedAtIso);

const listApprovedCreatorSubmissions = (
  state: MarketplaceState,
  creatorUserId: string
): TemplateSubmission[] => {
  const latestByTemplateId = new Map<string, TemplateSubmission>();

  state.submissions
    .filter((submission) => submission.status === 'approved')
    .filter((submission) => submission.submitterProfile.userId === creatorUserId)
    .sort(byLatestSubmission)
    .forEach((submission) => {
      const templateId = submission.template.metadata.id;
      if (!latestByTemplateId.has(templateId)) {
        latestByTemplateId.set(templateId, submission);
      }
    });

  return [...latestByTemplateId.values()].sort((left, right) =>
    left.template.metadata.id.localeCompare(right.template.metadata.id)
  );
};

const listActiveUsersForTemplate = (
  templateId: string,
  windowDays: number,
  nowIso: string
): string[] => {
  const templateEvents = listMarketplaceAnalyticsEvents({
    subjectType: 'template',
    subjectId: templateId,
    limit: 5000,
  })
    .filter((event) => withinWindow(event.createdAtIso, nowIso, windowDays))
    .sort((left, right) => toMs(left.createdAtIso) - toMs(right.createdAtIso));

  const latestByUser = new Map<string, (typeof templateEvents)[number]>();
  for (const event of templateEvents) {
    latestByUser.set(event.userId, event);
  }

  return [...latestByUser.values()]
    .filter((event) => event.eventType !== 'uninstall')
    .map((event) => event.userId)
    .sort((left, right) => left.localeCompare(right));
};

const bucketForRating = (averageRating: number): 1 | 2 | 3 | 4 | 5 => {
  return Math.max(1, Math.min(5, Math.round(averageRating))) as 1 | 2 | 3 | 4 | 5;
};

export interface CreatorRatingBucket {
  rating: 1 | 2 | 3 | 4 | 5;
  votes: number;
  share: number;
}

export interface CreatorTemplateMetric {
  templateId: string;
  templateName: string;
  installs: number;
  activeUsers: number;
  ratingAverage: number;
  ratingVotes: number;
  benchmarkCompliant: boolean;
}

export interface CreatorAnalyticsSnapshot {
  creatorUserId: string;
  generatedAtIso: string;
  templateCount: number;
  totalInstalls: number;
  activeUsers: number;
  averageRating: number;
  totalRatingVotes: number;
  benchmarkComplianceRate: number;
  revenueReadinessScore: number;
  ratingsDistribution: CreatorRatingBucket[];
  templates: CreatorTemplateMetric[];
}

const computeRevenueReadinessScore = (snapshot: {
  totalInstalls: number;
  activeUsers: number;
  averageRating: number;
  benchmarkComplianceRate: number;
}): number => {
  const installSignal = clamp(Math.log10(snapshot.totalInstalls + 1) / 2, 0, 1);
  const activeSignal = clamp(
    snapshot.totalInstalls === 0 ? 0 : snapshot.activeUsers / snapshot.totalInstalls,
    0,
    1
  );
  const ratingSignal = clamp(snapshot.averageRating / 5, 0, 1);
  const benchmarkSignal = clamp(snapshot.benchmarkComplianceRate, 0, 1);

  return round(
    clamp(
      installSignal * 0.35 +
        activeSignal * 0.25 +
        ratingSignal * 0.25 +
        benchmarkSignal * 0.15,
      0,
      1
    )
  );
};

export const buildCreatorAnalytics = (payload: {
  userId: string;
  creatorUserId?: string;
  nowIso?: string;
  activeWindowDays?: number;
}): CreatorAnalyticsSnapshot => {
  const creatorUserId = payload.creatorUserId ?? payload.userId;
  const nowIso = payload.nowIso ?? new Date().toISOString();
  const activeWindowDays = Math.max(1, payload.activeWindowDays ?? 30);
  const state = marketplaceStore.load(payload.userId);
  const submissions = listApprovedCreatorSubmissions(state, creatorUserId);

  const ratingsByBucket: Record<1 | 2 | 3 | 4 | 5, number> = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  };

  const aggregateActiveUsers = new Set<string>();

  const templateMetrics: CreatorTemplateMetric[] = submissions.map((submission) => {
    const templateId = submission.template.metadata.id;
    const stats = state.templateStats[templateId] ?? {
      installCount: 0,
      usageCount: 0,
      benchmarkVerified: false,
    };
    const rating = state.ratings[templateId] ?? { average: 0, votes: 0 };

    if (rating.votes > 0) {
      ratingsByBucket[bucketForRating(rating.average)] += rating.votes;
    }

    const activeUsers = listActiveUsersForTemplate(templateId, activeWindowDays, nowIso);
    activeUsers.forEach((userId) => aggregateActiveUsers.add(userId));

    return {
      templateId,
      templateName: submission.template.metadata.name,
      installs: Math.max(0, stats.installCount),
      activeUsers: activeUsers.length,
      ratingAverage: round(rating.average, 2),
      ratingVotes: Math.max(0, rating.votes),
      benchmarkCompliant: Boolean(stats.benchmarkVerified),
    };
  });

  const totalInstalls = templateMetrics.reduce((sum, metric) => sum + metric.installs, 0);
  const totalRatingVotes = templateMetrics.reduce((sum, metric) => sum + metric.ratingVotes, 0);
  const weightedRatingTotal = templateMetrics.reduce(
    (sum, metric) => sum + metric.ratingAverage * metric.ratingVotes,
    0
  );
  const averageRating = totalRatingVotes === 0 ? 0 : weightedRatingTotal / totalRatingVotes;
  const benchmarkComplianceRate =
    templateMetrics.length === 0
      ? 0
      : templateMetrics.filter((metric) => metric.benchmarkCompliant).length / templateMetrics.length;
  const activeUsers = aggregateActiveUsers.size;

  const distribution: CreatorRatingBucket[] = ([1, 2, 3, 4, 5] as const).map((rating) => {
    const votes = ratingsByBucket[rating];
    return {
      rating,
      votes,
      share: totalRatingVotes === 0 ? 0 : round(votes / totalRatingVotes),
    };
  });

  const revenueReadinessScore = computeRevenueReadinessScore({
    totalInstalls,
    activeUsers,
    averageRating,
    benchmarkComplianceRate,
  });

  return {
    creatorUserId,
    generatedAtIso: nowIso,
    templateCount: templateMetrics.length,
    totalInstalls,
    activeUsers,
    averageRating: round(averageRating, 4),
    totalRatingVotes,
    benchmarkComplianceRate: round(benchmarkComplianceRate),
    revenueReadinessScore,
    ratingsDistribution: distribution,
    templates: templateMetrics.sort((left, right) => {
      if (left.installs !== right.installs) return right.installs - left.installs;
      return left.templateId.localeCompare(right.templateId);
    }),
  };
};

const calculateSpotlightScore = (snapshot: CreatorAnalyticsSnapshot): number => {
  const installSignal = Math.log10(snapshot.totalInstalls + 1);
  const ratingSignal = snapshot.averageRating / 5;
  const benchmarkSignal = snapshot.benchmarkComplianceRate;
  return round(Math.max(0, installSignal * ratingSignal * benchmarkSignal), 6);
};

export interface CreatorSpotlightRecord {
  rank: number;
  creatorUserId: string;
  score: number;
  installs: number;
  averageRating: number;
  benchmarkComplianceRate: number;
  revenueReadinessScore: number;
}

export const listFeaturedCreatorSpotlights = (payload: {
  userId: string;
  limit?: number;
  nowIso?: string;
  activeWindowDays?: number;
}): CreatorSpotlightRecord[] => {
  const limit = Math.max(1, payload.limit ?? 6);
  const state = marketplaceStore.load(payload.userId);
  const creatorIds = [
    ...new Set(
      state.submissions
        .filter((submission) => submission.status === 'approved')
        .map((submission) => submission.submitterProfile.userId)
        .filter((creatorUserId) => creatorUserId.trim().length > 0)
    ),
  ];

  return creatorIds
    .map((creatorUserId) =>
      buildCreatorAnalytics({
        userId: payload.userId,
        creatorUserId,
        nowIso: payload.nowIso,
        activeWindowDays: payload.activeWindowDays,
      })
    )
    .map((snapshot) => ({
      creatorUserId: snapshot.creatorUserId,
      score: calculateSpotlightScore(snapshot),
      installs: snapshot.totalInstalls,
      averageRating: snapshot.averageRating,
      benchmarkComplianceRate: snapshot.benchmarkComplianceRate,
      revenueReadinessScore: snapshot.revenueReadinessScore,
    }))
    .sort((left, right) => {
      if (left.score !== right.score) return right.score - left.score;
      if (left.installs !== right.installs) return right.installs - left.installs;
      if (left.averageRating !== right.averageRating) return right.averageRating - left.averageRating;
      return left.creatorUserId.localeCompare(right.creatorUserId);
    })
    .slice(0, limit)
    .map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));
};

export interface WeeklyCreatorSpotlight {
  weekIndex: number;
  weekStartIso: string;
  featured: CreatorSpotlightRecord | null;
  candidates: CreatorSpotlightRecord[];
}

export const getWeeklyFeaturedCreatorSpotlight = (payload: {
  userId: string;
  nowIso?: string;
  candidateLimit?: number;
}): WeeklyCreatorSpotlight => {
  const nowIso = payload.nowIso ?? new Date().toISOString();
  const nowMs = toMs(nowIso);
  const weekIndex = Math.max(0, Math.floor(nowMs / WEEK_MS));
  const weekStartIso = new Date(weekIndex * WEEK_MS).toISOString();
  const candidates = listFeaturedCreatorSpotlights({
    userId: payload.userId,
    limit: Math.max(1, payload.candidateLimit ?? 8),
    nowIso,
  });

  if (candidates.length === 0) {
    return {
      weekIndex,
      weekStartIso,
      featured: null,
      candidates,
    };
  }

  const featured = candidates[weekIndex % candidates.length];
  return {
    weekIndex,
    weekStartIso,
    featured,
    candidates,
  };
};

export interface CreatorInterviewTemplate {
  creatorUserId: string;
  headline: string;
  intro: string;
  prompts: string[];
  cta: string;
}

export const buildCreatorInterviewTemplate = (payload: {
  spotlight: CreatorSpotlightRecord;
  weekStartIso?: string;
}): CreatorInterviewTemplate => {
  const weekStartIso = payload.weekStartIso ?? new Date().toISOString();
  const weekLabel = new Date(weekStartIso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return {
    creatorUserId: payload.spotlight.creatorUserId,
    headline: `Creator Spotlight (${weekLabel}): ${payload.spotlight.creatorUserId}`,
    intro:
      'Show how this creator drives installs, quality ratings, and benchmark-compliant releases with repeatable execution.',
    prompts: [
      'What repeatable process do you use when shipping a new template?',
      'Which signal changed most this week (installs, ratings, benchmark compliance), and why?',
      'What is one mistake newer creators should avoid when preparing a release?',
      'What experiment will you run next week to improve creator economics?',
    ],
    cta: 'Install one template from this creator and leave a structured review after three usage sessions.',
  };
};
