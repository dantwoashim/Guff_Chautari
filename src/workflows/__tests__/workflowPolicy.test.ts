import { describe, expect, it } from 'vitest';
import { planWorkflowFromPrompt } from '../workflowPlanner';
import {
  buildDefaultWorkflowPolicy,
  createEmptyWorkflowPolicyUsage,
  evaluateWorkflowStepPolicy,
} from '../workflowPolicy';

describe('workflowPolicy', () => {
  it('blocks connector actions outside the workflow allowlist', () => {
    const workflow = planWorkflowFromPrompt({
      userId: 'user-policy-1',
      prompt: 'Summarize my emails every morning',
      nowIso: '2026-02-17T00:00:00.000Z',
    });
    const policy = {
      ...buildDefaultWorkflowPolicy(workflow, '2026-02-17T00:00:00.000Z'),
      allowedConnectorIds: ['notion'],
    };

    const decision = evaluateWorkflowStepPolicy({
      policy,
      usage: createEmptyWorkflowPolicyUsage(),
      step: workflow.steps[0],
    });

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('connector_not_allowed');
    expect(decision.message).toContain('not allowed');
  });

  it('blocks step execution when budget is exceeded', () => {
    const workflow = planWorkflowFromPrompt({
      userId: 'user-policy-2',
      prompt: 'Summarize my emails every morning',
      nowIso: '2026-02-17T00:00:00.000Z',
    });
    const policy = {
      ...buildDefaultWorkflowPolicy(workflow, '2026-02-17T00:00:00.000Z'),
      budget: {
        maxConnectorCalls: 0,
      },
    };

    const decision = evaluateWorkflowStepPolicy({
      policy,
      usage: createEmptyWorkflowPolicyUsage(),
      step: workflow.steps[0],
    });

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('budget_exceeded');
    expect(decision.message).toContain('budget exceeded');
  });

  it('provides default runtime timeout budgets', () => {
    const workflow = planWorkflowFromPrompt({
      userId: 'user-policy-3',
      prompt: 'Summarize my emails every morning',
      nowIso: '2026-02-17T00:00:00.000Z',
    });
    const policy = buildDefaultWorkflowPolicy(workflow, '2026-02-17T00:00:00.000Z');
    expect(policy.budget?.maxRuntimeMs).toBeGreaterThan(1_000);
    expect(policy.allowedConnectorIds).toContain('email');
  });
});
