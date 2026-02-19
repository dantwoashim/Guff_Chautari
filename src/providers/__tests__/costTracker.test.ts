import { describe, expect, it } from 'vitest';
import { ProviderCostTracker } from '../costTracker';

describe('ProviderCostTracker', () => {
  it('tracks token usage and summarizes spend per provider', () => {
    const tracker = new ProviderCostTracker({
      nowIso: () => '2026-03-20T12:00:00.000Z',
    });

    tracker.recordUsage({
      workspaceId: 'workspace-1',
      providerId: 'gemini',
      model: 'gemini-2.5-pro',
      inputTokens: 1200,
      outputTokens: 800,
      estimatedCostUsd: 0.42,
      createdAtIso: '2026-03-18T09:00:00.000Z',
    });
    tracker.recordUsage({
      workspaceId: 'workspace-1',
      providerId: 'openai',
      model: 'gpt-4.1',
      inputTokens: 2000,
      outputTokens: 1000,
      estimatedCostUsd: 1.33,
      createdAtIso: '2026-03-19T09:00:00.000Z',
    });
    tracker.recordUsage({
      workspaceId: 'workspace-1',
      providerId: 'gemini',
      model: 'gemini-2.5-flash',
      inputTokens: 400,
      outputTokens: 300,
      estimatedCostUsd: 0.09,
      createdAtIso: '2026-03-20T08:30:00.000Z',
    });

    const summary = tracker.summarizeWorkspace({
      workspaceId: 'workspace-1',
      window: 'month',
      nowIso: '2026-03-20T12:00:00.000Z',
    });

    expect(summary.totalTokens).toBe(5700);
    expect(summary.totalCostUsd).toBe(1.84);
    expect(summary.providerBreakdown).toHaveLength(2);

    const gemini = summary.providerBreakdown.find((entry) => entry.providerId === 'gemini');
    expect(gemini?.totalTokens).toBe(2700);
    expect(gemini?.totalCostUsd).toBe(0.51);

    const openai = summary.providerBreakdown.find((entry) => entry.providerId === 'openai');
    expect(openai?.totalTokens).toBe(3000);
    expect(openai?.totalCostUsd).toBe(1.33);
  });

  it('emits threshold alerts only once and recommends downgrade at configured threshold', () => {
    const tracker = new ProviderCostTracker({
      nowIso: () => '2026-03-20T12:00:00.000Z',
    });

    tracker.recordUsage({
      workspaceId: 'workspace-2',
      providerId: 'gemini',
      model: 'gemini-2.5-pro',
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 8.1,
      createdAtIso: '2026-03-20T10:00:00.000Z',
    });

    const first = tracker.evaluateBudget({
      workspaceId: 'workspace-2',
      monthlyBudgetUsd: 10,
      alertThresholds: [0.5, 0.8, 1],
      downgradeThreshold: 0.8,
      nowIso: '2026-03-20T12:00:00.000Z',
    });

    expect(first.spentThisMonthUsd).toBe(8.1);
    expect(first.usageRatio).toBeGreaterThanOrEqual(0.8);
    expect(first.newlyReachedThresholds).toEqual([0.5, 0.8]);
    expect(first.shouldDowngrade).toBe(true);

    const second = tracker.evaluateBudget({
      workspaceId: 'workspace-2',
      monthlyBudgetUsd: 10,
      alertThresholds: [0.5, 0.8, 1],
      downgradeThreshold: 0.8,
      nowIso: '2026-03-20T12:05:00.000Z',
    });

    expect(second.newlyReachedThresholds).toEqual([]);
    expect(second.thresholdState).toEqual([0.5, 0.8]);
  });
});
