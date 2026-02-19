import { describe, expect, it } from 'vitest';
import { MockProvider } from '../mock/mockProvider';
import type { ModelProvider } from '../types';
import { ProviderCostTracker } from '../costTracker';
import { TaskRouter } from '../taskRouter';

const makeLookup = (providers: ModelProvider[]) => {
  const map = new Map(providers.map((provider) => [provider.id, provider]));
  return {
    resolve(providerId: string): ModelProvider {
      const provider = map.get(providerId);
      if (!provider) {
        throw new Error(`unknown provider: ${providerId}`);
      }
      return provider;
    },
    list(): string[] {
      return [...map.keys()];
    },
  };
};

describe('TaskRouter', () => {
  it('routes reasoning tasks to a high-capability model and embeddings to an embedding model', async () => {
    const router = new TaskRouter({
      providerLookup: makeLookup([
        new MockProvider({ id: 'gemini' }),
        new MockProvider({ id: 'openai' }),
      ]),
    });

    const reasoning = await router.resolveTaskRoute({
      workspaceId: 'workspace-1',
      task: 'reasoning',
    });
    expect(reasoning.providerId).toBe('gemini');
    expect(reasoning.model).toBe('gemini-2.5-pro');

    const embedding = await router.resolveTaskRoute({
      workspaceId: 'workspace-1',
      task: 'embedding',
    });
    expect(embedding.providerId).toBe('gemini');
    expect(embedding.model).toBe('text-embedding-004');
  });

  it('supports per-task user preferences with independent provider keys', async () => {
    const router = new TaskRouter({
      providerLookup: makeLookup([
        new MockProvider({ id: 'gemini' }),
        new MockProvider({ id: 'openai' }),
        new MockProvider({ id: 'anthropic' }),
      ]),
    });

    const reasoning = await router.resolveTaskRoute({
      workspaceId: 'workspace-2',
      task: 'reasoning',
      preferences: {
        reasoning: {
          providerId: 'anthropic',
          model: 'claude-3-7-sonnet-latest',
        },
      },
      providerApiKeys: {
        gemini: 'gemini-key',
        openai: 'openai-key',
        anthropic: 'anthropic-key',
      },
    });

    expect(reasoning.providerId).toBe('anthropic');
    expect(reasoning.model).toBe('claude-3-7-sonnet-latest');
    expect(reasoning.apiKey).toBe('anthropic-key');
  });

  it('switches to lower-cost route when budget threshold is reached and emits alert', async () => {
    const tracker = new ProviderCostTracker({
      nowIso: () => '2026-03-20T12:00:00.000Z',
    });
    tracker.recordUsage({
      workspaceId: 'workspace-3',
      providerId: 'gemini',
      model: 'gemini-2.5-pro',
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 9,
      createdAtIso: '2026-03-20T11:00:00.000Z',
    });

    const alerts: number[] = [];
    const router = new TaskRouter({
      providerLookup: makeLookup([new MockProvider({ id: 'gemini' })]),
      costTracker: tracker,
      defaultBudgetPolicy: {
        monthlyBudgetUsd: 10,
        alertThresholds: [0.8],
        downgradeThreshold: 0.8,
      },
      onBudgetAlert: ({ threshold }) => alerts.push(threshold),
    });

    const result = await router.resolveTaskRoute({
      workspaceId: 'workspace-3',
      task: 'reasoning',
    });

    expect(result.downgradedForBudget).toBe(true);
    expect(result.model).toBe('gemini-2.5-flash');
    expect(result.budget?.usageRatio).toBeGreaterThanOrEqual(0.8);
    expect(alerts).toEqual([0.8]);
  });
});
