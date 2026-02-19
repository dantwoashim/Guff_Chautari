import type { PolicyAction, RiskTier } from './types';

export interface RiskRule {
  action_id: string;
  risk_tier: RiskTier;
  idempotent: boolean;
}

export interface RiskClassification {
  risk_tier: RiskTier;
  reason: string;
}

export const DEFAULT_RISK_RULES: ReadonlyArray<RiskRule> = [
  { action_id: 'messages.list', risk_tier: 'green', idempotent: true },
  { action_id: 'memory.read', risk_tier: 'green', idempotent: true },
  { action_id: 'memory.write', risk_tier: 'yellow', idempotent: false },
  { action_id: 'persona.update', risk_tier: 'yellow', idempotent: false },
  { action_id: 'connector.invoke', risk_tier: 'yellow', idempotent: false },
  { action_id: 'byok.rotate', risk_tier: 'red', idempotent: false },
  { action_id: 'policy.update', risk_tier: 'red', idempotent: false },
  { action_id: 'connector.permission.grant', risk_tier: 'red', idempotent: false },
];

const ruleMap = new Map(DEFAULT_RISK_RULES.map((rule) => [rule.action_id, rule]));

export const classifyRiskTier = (
  action: PolicyAction,
  rules: ReadonlyArray<RiskRule> = DEFAULT_RISK_RULES
): RiskClassification => {
  const localRuleMap = rules === DEFAULT_RISK_RULES ? ruleMap : new Map(rules.map((rule) => [rule.action_id, rule]));
  const rule = localRuleMap.get(action.action_id);

  if (rule) {
    return {
      risk_tier: rule.risk_tier,
      reason: `rule:${rule.action_id}`,
    };
  }

  if (!action.mutation) {
    return {
      risk_tier: 'green',
      reason: 'read-only action',
    };
  }

  if (action.idempotent) {
    return {
      risk_tier: 'yellow',
      reason: 'mutation but idempotent',
    };
  }

  return {
    risk_tier: 'red',
    reason: 'mutation and non-idempotent',
  };
};

