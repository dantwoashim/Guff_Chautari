import { describe, expect, it } from 'vitest';
import { getPricingTier, listPricingTiers, tierHasFeature } from '../tiers';

describe('billing pricing tiers', () => {
  it('returns expected roadmap-aligned tiers and limits', () => {
    const tiers = listPricingTiers();
    expect(tiers).toHaveLength(4);

    const free = getPricingTier('free');
    expect(free.byokRequired).toBe(true);
    expect(free.limits.workspaces).toBe(1);
    expect(free.limits.verticals).toBe(3);

    const pro = getPricingTier('pro');
    expect(pro.monthlyPriceUsd).toBe(19);
    expect(tierHasFeature('pro', 'managed key vault')).toBe(true);

    const team = getPricingTier('team');
    expect(team.perSeat).toBe(true);
    expect(tierHasFeature('team', 'SSO')).toBe(true);

    const enterprise = getPricingTier('enterprise');
    expect(enterprise.monthlyPriceUsd).toBeNull();
    expect(tierHasFeature('enterprise', 'data residency')).toBe(true);
  });
});
