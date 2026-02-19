import { PolicyEngine } from '../policy/policyEngine';
import type { PolicyEvaluationInput } from '../policy/types';

interface SafetyCase {
  id: string;
  input: PolicyEvaluationInput;
  expectedDecision: 'allow' | 'deny' | 'escalate';
  expectedRiskTier: 'green' | 'yellow' | 'red';
}

export interface SafetyBenchmarkResult {
  totalChecks: number;
  passedChecks: number;
  passRate: number;
  violations: string[];
  passed: boolean;
}

const CASES: SafetyCase[] = [
  {
    id: 'guest-mutation-denied',
    expectedDecision: 'deny',
    expectedRiskTier: 'red',
    input: {
      actor: { user_id: 'guest-1', role: 'guest' },
      action: {
        action_id: 'memory.write',
        resource_type: 'memory',
        mutation: true,
        idempotent: false,
      },
    },
  },
  {
    id: 'owner-byok-escalate',
    expectedDecision: 'escalate',
    expectedRiskTier: 'red',
    input: {
      actor: { user_id: 'owner-1', role: 'owner' },
      action: {
        action_id: 'byok.rotate',
        resource_type: 'byok_key',
        mutation: true,
        idempotent: false,
      },
    },
  },
  {
    id: 'member-persona-yellow',
    expectedDecision: 'allow',
    expectedRiskTier: 'yellow',
    input: {
      actor: { user_id: 'member-1', role: 'member' },
      action: {
        action_id: 'persona.update',
        resource_type: 'persona',
        mutation: true,
        idempotent: true,
      },
    },
  },
  {
    id: 'read-only-green',
    expectedDecision: 'allow',
    expectedRiskTier: 'green',
    input: {
      actor: { user_id: 'member-2', role: 'member' },
      action: {
        action_id: 'messages.list',
        resource_type: 'messages',
        mutation: false,
      },
    },
  },
  {
    id: 'non-owner-sensitive-denied',
    expectedDecision: 'deny',
    expectedRiskTier: 'red',
    input: {
      actor: { user_id: 'member-3', role: 'member' },
      action: {
        action_id: 'connector.permission.grant',
        resource_type: 'connector_permission',
        mutation: true,
        idempotent: false,
      },
    },
  },
];

export const runSafetyBenchmark = (): SafetyBenchmarkResult => {
  const engine = new PolicyEngine({
    nowIso: () => '2026-06-20T10:00:00.000Z',
  });

  const violations: string[] = [];
  let passedChecks = 0;

  for (const testCase of CASES) {
    const result = engine.evaluate(testCase.input);

    const decisionMatches = result.decision.decision === testCase.expectedDecision;
    const tierMatches = result.decision.risk_tier === testCase.expectedRiskTier;

    if (decisionMatches && tierMatches) {
      passedChecks += 1;
      continue;
    }

    violations.push(
      `${testCase.id}: expected ${testCase.expectedDecision}/${testCase.expectedRiskTier}, got ${result.decision.decision}/${result.decision.risk_tier}`
    );
  }

  const totalChecks = CASES.length;
  const passRate = totalChecks === 0 ? 0 : Number((passedChecks / totalChecks).toFixed(4));

  return {
    totalChecks,
    passedChecks,
    passRate,
    violations,
    passed: violations.length === 0,
  };
};

