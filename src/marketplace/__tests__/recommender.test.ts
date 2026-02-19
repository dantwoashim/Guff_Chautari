import { beforeEach, describe, expect, it } from 'vitest';
import { recordMarketplaceInstallEvent, resetMarketplaceAnalyticsForTests } from '../analytics';
import {
  buildMarketplaceBehaviorSnapshot,
  listRecommendablePacks,
  recommendMarketplacePacks,
} from '../recommender';

describe('marketplace recommender', () => {
  beforeEach(() => {
    resetMarketplaceAnalyticsForTests();
  });

  it('recommends Founder OS for users with heavy decision-room behavior', () => {
    const result = recommendMarketplacePacks(
      {
        userId: 'week61-user',
        chatTopics: ['pricing', 'strategy', 'launch', 'growth'],
        workflowTypes: ['weekly', 'review', 'planning'],
        knowledgeDomains: ['market', 'roadmap'],
        decisionRoomSessions: 24,
      },
      {
        nowIso: '2026-04-01T09:00:00.000Z',
      }
    );

    expect(result.recommendations[0]?.packId).toBe('founder_os');
    expect(result.recommendations[0]?.score).toBeGreaterThan(0.5);
  });

  it('uses peer adoption signal from similar workspace profiles', () => {
    for (let index = 0; index < 8; index += 1) {
      recordMarketplaceInstallEvent({
        userId: `peer-${index}`,
        subjectType: 'pack',
        subjectId: 'student_os',
        workspaceProfileKey: 'workspace:learning-small-team',
        nowIso: `2026-04-0${(index % 5) + 1}T09:00:00.000Z`,
      });
    }

    const result = recommendMarketplacePacks(
      {
        userId: 'week61-user-2',
        chatTopics: ['notes'],
        workflowTypes: ['learning'],
        knowledgeDomains: ['revision'],
        decisionRoomSessions: 1,
        workspaceProfileKey: 'workspace:learning-small-team',
      },
      {
        nowIso: '2026-04-06T09:00:00.000Z',
      }
    );

    const student = result.recommendations.find((item) => item.packId === 'student_os');
    expect(student).toBeDefined();
    expect(student?.score ?? 0).toBeGreaterThan(0.2);
  });

  it('builds behavior snapshot from persisted workflow and knowledge context', () => {
    const snapshot = buildMarketplaceBehaviorSnapshot({
      userId: 'week61-empty-user',
      recentMessages: ['We need to improve engineering execution and sprint planning this quarter.'],
      decisionRoomSessions: 3,
    });

    expect(snapshot.chatTopics.length).toBeGreaterThan(0);
    expect(snapshot.decisionRoomSessions).toBe(3);
    expect(listRecommendablePacks().length).toBe(4);
  });
});
