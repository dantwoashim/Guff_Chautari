import type { ActivityStore } from '../activity';
import { activityStore as defaultActivityStore, listActivityEvents } from '../activity';
import type { KnowledgeGraphStore } from '../knowledge';
import { knowledgeGraphStore as defaultKnowledgeStore } from '../knowledge';
import type { WorkflowStore } from '../workflows';
import { workflowStore as defaultWorkflowStore } from '../workflows';
import { BUILT_IN_VERTICAL_PACKS, type VerticalPackId } from './packs';
import { getPeerPackAdoption, listTrendingPacks } from './analytics';

const STOPWORDS = new Set([
  'the',
  'and',
  'with',
  'this',
  'that',
  'from',
  'into',
  'about',
  'will',
  'your',
  'have',
  'been',
  'were',
  'their',
  'what',
  'when',
  'where',
  'which',
  'should',
  'could',
  'would',
]);

const tokenize = (value: string): string[] =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));

const topTokens = (texts: ReadonlyArray<string>, limit = 12): string[] => {
  const counts = new Map<string, number>();
  for (const text of texts) {
    for (const token of tokenize(text)) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, Math.max(1, limit))
    .map(([token]) => token);
};

const unique = (values: ReadonlyArray<string>): string[] => [...new Set(values.filter(Boolean))];

interface PackRecommendationProfile {
  packId: VerticalPackId;
  keywords: string[];
  workflowKeywords: string[];
  reasons: {
    affinity: string;
    behavior: string;
    peer: string;
    trend: string;
  };
}

const PACK_PROFILES: ReadonlyArray<PackRecommendationProfile> = [
  {
    packId: 'founder_os',
    keywords: ['decision', 'strategy', 'pricing', 'growth', 'launch', 'market', 'founder', 'roadmap'],
    workflowKeywords: ['review', 'weekly', 'scorecard', 'planning', 'execution'],
    reasons: {
      affinity: 'High decision/strategy affinity in your recent context.',
      behavior: 'Your decision-room usage pattern fits founder execution loops.',
      peer: 'Similar workspaces are adopting Founder OS.',
      trend: 'Founder OS is trending this week.',
    },
  },
  {
    packId: 'student_os',
    keywords: ['study', 'learning', 'exam', 'revision', 'recall', 'course', 'student', 'research'],
    workflowKeywords: ['research', 'notes', 'synthesis', 'reading', 'learning'],
    reasons: {
      affinity: 'Your context indicates sustained learning/research topics.',
      behavior: 'Workflow patterns match structured study routines.',
      peer: 'Similar workspaces are adopting Student OS.',
      trend: 'Student OS is trending this week.',
    },
  },
  {
    packId: 'engineering_lead_os',
    keywords: ['engineering', 'sprint', 'incident', 'architecture', 'backlog', 'retrospective', 'team'],
    workflowKeywords: ['meeting', 'notes', 'actions', 'operations', 'planning'],
    reasons: {
      affinity: 'Your context emphasizes engineering execution and coordination.',
      behavior: 'Workflow usage matches engineering leadership cadence.',
      peer: 'Similar workspaces are adopting Engineering Lead OS.',
      trend: 'Engineering Lead OS is trending this week.',
    },
  },
  {
    packId: 'writers_studio_os',
    keywords: ['writing', 'creative', 'journal', 'story', 'draft', 'voice', 'idea', 'author'],
    workflowKeywords: ['prompt', 'journal', 'creative', 'synthesis', 'publish'],
    reasons: {
      affinity: 'Your context shows strong writing and creative intent.',
      behavior: 'Workflow patterns align with iterative drafting loops.',
      peer: 'Similar workspaces are adopting Writer\'s Studio OS.',
      trend: 'Writer\'s Studio OS is trending this week.',
    },
  },
];

export interface MarketplaceBehaviorSnapshot {
  userId: string;
  chatTopics: string[];
  workflowTypes: string[];
  knowledgeDomains: string[];
  decisionRoomSessions: number;
  workspaceProfileKey?: string;
}

export interface PackRecommendation {
  packId: VerticalPackId;
  score: number;
  reasons: string[];
}

export interface MarketplaceRecommendationResult {
  generatedAtIso: string;
  snapshot: MarketplaceBehaviorSnapshot;
  recommendations: PackRecommendation[];
}

const overlapRatio = (left: ReadonlyArray<string>, right: ReadonlyArray<string>): number => {
  if (left.length === 0 || right.length === 0) return 0;
  const leftSet = new Set(left);
  const matches = right.filter((token) => leftSet.has(token)).length;
  return matches / right.length;
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const toSnapshotTokens = (snapshot: MarketplaceBehaviorSnapshot): string[] => {
  return unique([
    ...snapshot.chatTopics,
    ...snapshot.workflowTypes,
    ...snapshot.knowledgeDomains,
  ].map((token) => token.toLowerCase()));
};

export const buildMarketplaceBehaviorSnapshot = (
  payload: {
    userId: string;
    recentMessages?: string[];
    decisionRoomSessions?: number;
    workspaceProfileKey?: string;
  },
  dependencies: {
    workflowStore?: WorkflowStore;
    knowledgeStore?: KnowledgeGraphStore;
    activityStore?: ActivityStore;
  } = {}
): MarketplaceBehaviorSnapshot => {
  const workflowStore = dependencies.workflowStore ?? defaultWorkflowStore;
  const knowledgeStore = dependencies.knowledgeStore ?? defaultKnowledgeStore;
  const activityStore = dependencies.activityStore ?? defaultActivityStore;

  const workflowState = workflowStore.load(payload.userId);
  const knowledgeState = knowledgeStore.load(payload.userId);

  const workflowTexts = workflowState.workflows.map(
    (workflow) => `${workflow.name} ${workflow.description ?? ''} ${workflow.naturalLanguagePrompt ?? ''}`
  );
  const knowledgeTexts = knowledgeState.sources.map(
    (source) => `${source.title} ${source.metadata?.tags ? String(source.metadata.tags) : ''}`
  );

  const messageTexts = payload.recentMessages ?? [];
  const inferredDecisionSessions = listActivityEvents(
    {
      userId: payload.userId,
      limit: 400,
    },
    activityStore
  ).filter((event) => event.eventType.startsWith('decision.')).length;

  return {
    userId: payload.userId,
    chatTopics: topTokens(messageTexts, 12),
    workflowTypes: topTokens(workflowTexts, 10),
    knowledgeDomains: topTokens(knowledgeTexts, 10),
    decisionRoomSessions: Math.max(0, payload.decisionRoomSessions ?? inferredDecisionSessions),
    workspaceProfileKey: payload.workspaceProfileKey,
  };
};

export const recommendMarketplacePacks = (
  snapshot: MarketplaceBehaviorSnapshot,
  options: {
    nowIso?: string;
    limit?: number;
    trendingWindowDays?: number;
    peerWindowDays?: number;
  } = {}
): MarketplaceRecommendationResult => {
  const nowIso = options.nowIso ?? new Date().toISOString();
  const limit = Math.max(1, options.limit ?? 4);
  const trendingWindowDays = Math.max(1, options.trendingWindowDays ?? 7);
  const peerWindowDays = Math.max(1, options.peerWindowDays ?? 30);

  const tokens = toSnapshotTokens(snapshot);
  const trendingSet = new Set(
    listTrendingPacks({ nowIso, windowDays: trendingWindowDays, minInstalls: 5, limit: 20 }).map(
      (record) => record.packId
    )
  );

  const scored: PackRecommendation[] = PACK_PROFILES.map((profile) => {
    const reasons: string[] = [];

    const topicAffinity = overlapRatio(tokens, profile.keywords);
    const workflowAffinity = overlapRatio(tokens, profile.workflowKeywords);
    const affinityScore = clamp(topicAffinity * 0.55 + workflowAffinity * 0.25, 0, 1);
    if (affinityScore > 0.1) {
      reasons.push(profile.reasons.affinity);
    }

    let behaviorScore = 0;
    if (profile.packId === 'founder_os') {
      behaviorScore = clamp(snapshot.decisionRoomSessions / 30, 0, 1) * 0.25;
      if (snapshot.decisionRoomSessions >= 20) {
        reasons.push(profile.reasons.behavior);
      }
    }

    const peer = getPeerPackAdoption({
      packId: profile.packId,
      workspaceProfileKey: snapshot.workspaceProfileKey,
      nowIso,
      windowDays: peerWindowDays,
    });
    const peerScore = peer.peerAdoptionScore * 0.2;
    if (peer.peerAdoptionScore > 0.18) {
      reasons.push(profile.reasons.peer);
    }

    const trendScore = trendingSet.has(profile.packId) ? 0.12 : 0;
    if (trendScore > 0) {
      reasons.push(profile.reasons.trend);
    }

    const score = Number(clamp(affinityScore + behaviorScore + peerScore + trendScore, 0, 1).toFixed(4));

    return {
      packId: profile.packId,
      score,
      reasons: unique(reasons),
    };
  });

  const recommendations = scored
    .sort((left, right) => {
      if (left.score !== right.score) return right.score - left.score;
      return left.packId.localeCompare(right.packId);
    })
    .slice(0, limit);

  return {
    generatedAtIso: nowIso,
    snapshot,
    recommendations,
  };
};

export const listRecommenderPackProfiles = () => {
  return PACK_PROFILES.map((profile) => ({
    packId: profile.packId,
    keywords: [...profile.keywords],
    workflowKeywords: [...profile.workflowKeywords],
  }));
};

export const listRecommendablePacks = (): VerticalPackId[] => {
  const ids = new Set(BUILT_IN_VERTICAL_PACKS.map((pack) => pack.id));
  return PACK_PROFILES.map((profile) => profile.packId).filter((id) => ids.has(id));
};
