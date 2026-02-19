import { describe, expect, it } from 'vitest';
import {
  composeRegionalDecisionMetadata,
  evaluateRegionalSafety,
  resolveRegionalSafetyProfile,
} from '../regionalSafety';
import type { PolicyDecisionRecord } from '../types';

const baseDecision: PolicyDecisionRecord = {
  id: 'policy-1',
  actor_user_id: 'user-1',
  action_id: 'memory.read',
  resource_type: 'memory',
  decision: 'allow',
  risk_tier: 'green',
  reason: 'read only',
  expires_at: null,
  created_at: '2026-02-18T00:00:00.000Z',
  metadata: {},
};

describe('regional safety profiles', () => {
  it('selects GDPR profile for EU contexts', () => {
    const profile = resolveRegionalSafetyProfile({
      countryCode: 'DE',
    });
    expect(profile.jurisdiction).toBe('eu');

    const evaluated = evaluateRegionalSafety({
      context: {
        countryCode: 'DE',
        age: 16,
      },
    });
    expect(evaluated.obligations).toContain('enforce_data_subject_rights');
    expect(evaluated.obligations).toContain('require_age_verification');
    expect(evaluated.obligations).toContain('treat_as_minor_profile');
  });

  it('selects CCPA profile for California users and composes metadata', () => {
    const profile = resolveRegionalSafetyProfile({
      countryCode: 'US',
      subdivisionCode: 'CA',
    });
    expect(profile.jurisdiction).toBe('us_ca');

    const composed = composeRegionalDecisionMetadata({
      decision: baseDecision,
      context: {
        countryCode: 'US',
        subdivisionCode: 'CA',
      },
    });
    expect(composed.metadata.regional_jurisdiction).toBe('us_ca');
    expect(composed.metadata.data_handling).toEqual(['ccpa']);
    expect(
      (composed.metadata.regional_obligations as string[]).includes('enforce_opt_out_and_delete')
    ).toBe(true);
  });
});
