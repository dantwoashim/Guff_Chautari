import { describe, expect, it } from 'vitest';
import { validatePolicyDecisionSchema } from '../types';

describe('policy types', () => {
  it('validates policy decision schema', () => {
    const valid = validatePolicyDecisionSchema({
      decision: 'allow',
      risk_tier: 'green',
      reason: 'read-only action',
      expires_at: null,
    });

    expect(valid.ok).toBe(true);

    const invalid = validatePolicyDecisionSchema({
      decision: 'approve' as 'allow',
      risk_tier: 'blue' as 'green',
      reason: '',
      expires_at: 123 as unknown as string,
    });

    expect(invalid.ok).toBe(false);
    expect(invalid.errors.length).toBeGreaterThan(0);
  });
});

