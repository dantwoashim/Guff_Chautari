import type { PricingTier, PricingTierId } from './types';

const TIERS: Record<PricingTierId, PricingTier> = {
  free: {
    id: 'free',
    name: 'Free',
    monthlyPriceUsd: 0,
    perSeat: false,
    byokRequired: true,
    supportModel: 'community',
    features: ['BYOK required', 'Community support', 'Core chat + memory'],
    limits: {
      workspaces: 1,
      verticals: 3,
      teamMembers: 1,
    },
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    monthlyPriceUsd: 19,
    perSeat: false,
    byokRequired: false,
    supportModel: 'email',
    features: [
      'Managed key vault',
      'Unlimited workspaces',
      'All verticals',
      'Priority marketplace listing',
      'Email support',
    ],
    limits: {
      workspaces: 'unlimited',
      verticals: 'all',
      teamMembers: 5,
    },
  },
  team: {
    id: 'team',
    name: 'Team',
    monthlyPriceUsd: 49,
    perSeat: true,
    byokRequired: false,
    supportModel: 'sla',
    features: [
      'SSO (OIDC/SAML)',
      'Organization management',
      'Team analytics',
      'Shared key vault',
      'SLA-backed support',
    ],
    limits: {
      workspaces: 'unlimited',
      verticals: 'all',
      teamMembers: 'unlimited',
    },
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    monthlyPriceUsd: null,
    perSeat: true,
    byokRequired: false,
    supportModel: 'dedicated',
    features: [
      'Data residency controls',
      'Dedicated support',
      'Custom connectors',
      'Audit + compliance package',
      'Contracted security review',
    ],
    limits: {
      workspaces: 'custom',
      verticals: 'all',
      teamMembers: 'custom',
    },
  },
};

const TIER_RANK: Record<PricingTierId, number> = {
  free: 0,
  pro: 1,
  team: 2,
  enterprise: 3,
};

export const listPricingTiers = (): PricingTier[] =>
  (['free', 'pro', 'team', 'enterprise'] as const).map((id) => ({
    ...TIERS[id],
    features: [...TIERS[id].features],
    limits: { ...TIERS[id].limits },
  }));

export const getPricingTier = (tierId: PricingTierId): PricingTier => ({
  ...TIERS[tierId],
  features: [...TIERS[tierId].features],
  limits: { ...TIERS[tierId].limits },
});

export const tierHasFeature = (tierId: PricingTierId, featureSnippet: string): boolean => {
  const needle = featureSnippet.trim().toLowerCase();
  if (!needle) return false;
  return TIERS[tierId].features.some((feature) => feature.toLowerCase().includes(needle));
};

export const compareTierRank = (left: PricingTierId, right: PricingTierId): number =>
  TIER_RANK[left] - TIER_RANK[right];

export const isTierAtLeast = (tierId: PricingTierId, minimumTierId: PricingTierId): boolean =>
  compareTierRank(tierId, minimumTierId) >= 0;

export const resolveDefaultTierForWorkspace = (workspaceCount: number): PricingTierId => {
  if (workspaceCount <= 1) return 'free';
  if (workspaceCount <= 5) return 'pro';
  return 'team';
};
