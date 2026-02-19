import { describe, expect, it } from 'vitest';
import { AutonomyGuardrails } from '../guardrails';

describe('AutonomyGuardrails', () => {
  it('pauses plan on irreversible action until approval is granted', () => {
    const guardrails = new AutonomyGuardrails({
      nowIso: () => '2026-03-01T09:00:00.000Z',
    });
    guardrails.registerPlan({
      planId: 'plan-1',
      policy: {
        escalationThresholdPct: 0.9,
        resourceBudget: {
          maxTokens: 10_000,
          maxApiCalls: 100,
          maxConnectorActions: 20,
          maxRuntimeHours: 8,
        },
      },
    });

    const first = guardrails.evaluateAction({
      planId: 'plan-1',
      actionId: 'delete-doc',
      irreversible: true,
    });
    expect(first.allow).toBe(false);
    expect(first.escalation?.type).toBe('irreversible');
    expect(guardrails.isPlanPaused('plan-1')).toBe(true);

    guardrails.resolveEscalation({
      escalationId: first.escalation!.id,
      decision: 'approve',
      reviewerUserId: 'owner-1',
      nowIso: '2026-03-01T09:05:00.000Z',
    });

    const second = guardrails.evaluateAction({
      planId: 'plan-1',
      actionId: 'delete-doc',
      irreversible: true,
    });
    expect(second.allow).toBe(true);
  });

  it('kill switch halts all plans', () => {
    const guardrails = new AutonomyGuardrails({
      nowIso: () => '2026-03-01T09:00:00.000Z',
    });
    guardrails.registerPlan({
      planId: 'plan-a',
      policy: {
        escalationThresholdPct: 0.8,
        resourceBudget: {
          maxTokens: 1000,
          maxApiCalls: 10,
          maxConnectorActions: 5,
          maxRuntimeHours: 1,
        },
      },
    });
    guardrails.registerPlan({
      planId: 'plan-b',
      policy: {
        escalationThresholdPct: 0.8,
        resourceBudget: {
          maxTokens: 1000,
          maxApiCalls: 10,
          maxConnectorActions: 5,
          maxRuntimeHours: 1,
        },
      },
    });

    guardrails.activateKillSwitch('manual emergency');
    expect(guardrails.isKillSwitchActive()).toBe(true);
    expect(guardrails.isPlanPaused('plan-a')).toBe(true);
    expect(guardrails.isPlanPaused('plan-b')).toBe(true);

    const blocked = guardrails.evaluateAction({
      planId: 'plan-a',
      actionId: 'continue-run',
    });
    expect(blocked.allow).toBe(false);
    expect(blocked.blockedByKillSwitch).toBe(true);
  });
});
