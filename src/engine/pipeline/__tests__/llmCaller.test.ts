import { describe, expect, it } from 'vitest';
import type { ModelProvider, ProviderValidationResult, StreamChatRequest } from '../../../providers';
import type { PromptBuilderOutput } from '../types';
import { createLLMCaller } from '../stages/llmCaller';

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

class MockProvider implements ModelProvider {
  readonly id = 'mock';
  lastRequest: StreamChatRequest | null = null;

  constructor(private readonly chunks: string[], private readonly delayMs = 0) {}

  async validateKey(): Promise<ProviderValidationResult> {
    return { ok: true, status: 'healthy' };
  }

  async *streamChat(request: StreamChatRequest) {
    this.lastRequest = request;
    for (const chunk of this.chunks) {
      if (this.delayMs > 0) {
        await wait(this.delayMs);
      }
      yield { text: chunk };
    }
  }

  async embed() {
    return {
      model: 'mock-embed',
      vectors: [[0.1, 0.2]],
      dimensions: 2,
    };
  }
}

const makeInput = (abortSignal?: AbortSignal): PromptBuilderOutput => ({
  input: {
    threadId: 'thread-1',
    userId: 'user-1',
    personaId: 'persona-1',
    userMessage: {
      id: 'msg-1',
      role: 'user',
      text: 'Give me a focused weekly execution plan.',
      timestamp: Date.UTC(2026, 3, 15, 9, 0, 0),
    },
    timestamp: Date.UTC(2026, 3, 15, 9, 0, 0),
    provider: 'mock',
    model: 'mock-chat',
    abortSignal,
  },
  context: {
    history: [],
    memories: [],
    time: {
      hour: 9,
      period: 'morning',
      dayType: 'weekday',
      isWeekend: false,
    },
    relationship: {
      stage: 'friend',
      trustScore: 0.7,
      daysTogether: 50,
      messageCount: 80,
      unresolvedTension: false,
    },
    persona: {
      id: 'persona-1',
      name: 'Ashim',
      systemInstruction: 'Be practical.',
    },
  },
  identity: {
    variant: 'morning_self',
    confidence: 0.9,
    energy: 0.8,
    reasons: ['morning context'],
  },
  emotional: {
    surface: { label: 'calm', intensity: 0.5, rationale: 'stable' },
    felt: { label: 'calm', intensity: 0.55, rationale: 'stable' },
    suppressed: { label: 'neutral', intensity: 0.1, rationale: 'low' },
    unconscious: { label: 'calm', intensity: 0.2, rationale: 'secure' },
    emotionalDebt: 5,
    dischargeRisk: 0.12,
  },
  prompt: {
    systemInstruction: '[CORE_PERSONA]\nBe practical.',
    tiers: {
      immutableCore: 'Be practical.',
      sessionDiff: 'energy=0.8',
      contextualRetrieval: 'memory: user prefers concise action plans',
      estimatedTokens: 120,
      cprActive: true,
    },
  },
});

describe('llmCaller', () => {
  it('streams chunks from provider and returns concatenated text', async () => {
    const provider = new MockProvider(['Hello ', 'world', '!']);
    const stage = createLLMCaller({
      resolveProvider: () => provider,
      timeoutMs: 5_000,
      defaultModel: 'mock-chat',
    });

    const result = await stage.run(makeInput());

    expect(result.llm.cancelled).toBe(false);
    expect(result.llm.timedOut).toBe(false);
    expect(result.llm.chunks).toHaveLength(3);
    expect(result.llm.text).toBe('Hello world!');
    expect(result.llm.chunks[2].isFinal).toBe(true);
  });

  it('stops streaming when abort signal is triggered', async () => {
    const provider = new MockProvider(['chunk-1 ', 'chunk-2 ', 'chunk-3'], 20);
    const controller = new AbortController();

    const stage = createLLMCaller({
      resolveProvider: () => provider,
      timeoutMs: 5_000,
      defaultModel: 'mock-chat',
    });

    setTimeout(() => controller.abort(), 35);

    const result = await stage.run(makeInput(controller.signal));

    expect(result.llm.cancelled).toBe(true);
    expect(result.llm.timedOut).toBe(false);
    expect(result.llm.text.length).toBeGreaterThan(0);
    expect(result.llm.chunks.length).toBeLessThan(3);
  });

  it('includes inline attachment parts for multimodal user turns', async () => {
    const provider = new MockProvider(['ok']);
    const stage = createLLMCaller({
      resolveProvider: () => provider,
      timeoutMs: 5_000,
      defaultModel: 'mock-chat',
    });

    const input = makeInput();
    input.input.userMessage = {
      ...input.input.userMessage,
      text: '',
      attachments: [
        {
          id: 'att-1',
          type: 'image',
          mimeType: 'image/png',
          url: 'data:image/png;base64,ZmFrZS1pbWFnZS1kYXRh',
        },
      ],
    };

    await stage.run(input);

    const userMessage = provider.lastRequest?.messages.find((message) => message.role === 'user');
    expect(userMessage).toBeTruthy();
    expect(Array.isArray(userMessage?.content)).toBe(true);

    const parts = userMessage?.content as Array<{ type: string }>;
    expect(parts.some((part) => part.type === 'inline_data')).toBe(true);
  });

  it('invokes plugin tool markers through stage-5 runtime hooks', async () => {
    const provider = new MockProvider(['Draft complete [[tool:pomodoro.get_focus_stats {}]]']);
    const stage = createLLMCaller({
      resolveProvider: () => provider,
      timeoutMs: 5_000,
      defaultModel: 'mock-chat',
    });

    const input = makeInput();
    const invocations: string[] = [];
    input.input.pluginTools = {
      allowedToolIds: ['pomodoro.get_focus_stats'],
      async invoke(toolId) {
        invocations.push(toolId);
        return {
          ok: true,
          summary: 'Focus stats: 3 sessions, 75 minutes total.',
        };
      },
    };

    const result = await stage.run(input);

    expect(invocations).toEqual(['pomodoro.get_focus_stats']);
    expect(result.llm.text).toContain('[Plugin tool result] Focus stats: 3 sessions, 75 minutes total.');
  });
});
