import { beforeEach, describe, expect, it } from 'vitest';
import {
  getPackSocialProof,
  listTrendingPacks,
  recordMarketplaceInstallEvent,
  recordMarketplaceUninstallEvent,
  recordMarketplaceUsageEvent,
  resetMarketplaceAnalyticsForTests,
  summarizeMarketplaceSubject,
} from '../analytics';

describe('marketplace analytics', () => {
  beforeEach(() => {
    resetMarketplaceAnalyticsForTests();
  });

  it('marks a pack as trending when install velocity is high', () => {
    const baseIso = Date.parse('2026-03-29T00:00:00.000Z');
    for (let index = 0; index < 50; index += 1) {
      const nowIso = new Date(baseIso - index * 60 * 60 * 1000).toISOString();
      recordMarketplaceInstallEvent({
        userId: `user-${index}`,
        subjectType: 'pack',
        subjectId: 'founder_os',
        nowIso,
      });
    }

    const trending = listTrendingPacks({
      nowIso: '2026-03-29T12:00:00.000Z',
      windowDays: 7,
      minInstalls: 10,
    });

    expect(trending.some((record) => record.packId === 'founder_os')).toBe(true);
    const founder = trending.find((record) => record.packId === 'founder_os');
    expect(founder?.installsInWindow).toBe(50);
  });

  it('computes social proof and uninstall/usage rates for pack subjects', () => {
    recordMarketplaceInstallEvent({
      userId: 'user-1',
      subjectType: 'pack',
      subjectId: 'student_os',
      nowIso: '2026-03-30T09:00:00.000Z',
    });
    recordMarketplaceInstallEvent({
      userId: 'user-2',
      subjectType: 'pack',
      subjectId: 'student_os',
      nowIso: '2026-03-30T09:05:00.000Z',
    });
    recordMarketplaceUsageEvent({
      userId: 'user-1',
      subjectType: 'pack',
      subjectId: 'student_os',
      nowIso: '2026-03-30T09:10:00.000Z',
    });
    recordMarketplaceUninstallEvent({
      userId: 'user-2',
      subjectType: 'pack',
      subjectId: 'student_os',
      nowIso: '2026-03-30T09:11:00.000Z',
    });

    const summary = summarizeMarketplaceSubject({
      subjectType: 'pack',
      subjectId: 'student_os',
      nowIso: '2026-03-30T10:00:00.000Z',
      windowDays: 7,
    });

    expect(summary.installCount).toBe(2);
    expect(summary.usageCount).toBe(1);
    expect(summary.uninstallCount).toBe(1);
    expect(summary.uniqueInstallUsers).toBe(2);
    expect(summary.activeUsers).toBe(1);

    const social = getPackSocialProof({
      packId: 'student_os',
      nowIso: '2026-03-30T10:00:00.000Z',
      windowDays: 7,
    });
    expect(social.usersUsing).toBe(1);
    expect(social.totalInstalls).toBe(2);
  });
});
