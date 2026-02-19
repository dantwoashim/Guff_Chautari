import { describe, expect, it } from 'vitest';
import { classifyRiskTier } from '../riskClassifier';

describe('riskClassifier', () => {
  it('classifies actions by explicit rules and mutation fallback', () => {
    const byRule = classifyRiskTier({
      action_id: 'byok.rotate',
      resource_type: 'byok_key',
      mutation: true,
      idempotent: false,
    });

    expect(byRule.risk_tier).toBe('red');

    const fallbackRead = classifyRiskTier({
      action_id: 'custom.read',
      resource_type: 'message',
      mutation: false,
      idempotent: true,
    });

    const fallbackMutation = classifyRiskTier({
      action_id: 'custom.write',
      resource_type: 'memory',
      mutation: true,
      idempotent: true,
    });

    expect(fallbackRead.risk_tier).toBe('green');
    expect(fallbackMutation.risk_tier).toBe('yellow');
  });
});

