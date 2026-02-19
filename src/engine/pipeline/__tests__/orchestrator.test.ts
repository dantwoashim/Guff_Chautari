import { describe, expect, it, vi } from 'vitest';
import { createHumanizer } from '../stages/humanizer';
import { createLearner } from '../stages/learner';
import { PipelineExecutionError, PipelineOrchestrator } from '../orchestrator';
import type {
  ContextGathererOutput,
  EmotionalProcessorOutput,
  IdentityResolverOutput,
  LLMCallerOutput,
  PipelineInput,
  PromptBuilderOutput,
} from '../types';

const input: PipelineInput = {
  threadId: 'thread-1',
  userId: 'user-1',
  personaId: 'persona-1',
  userMessage: {
    id: 'msg-1',
    role: 'user',
    text: 'Help me set a practical weekly execution plan.',
    timestamp: Date.UTC(2026, 3, 21, 10, 0, 0),
  },
  timestamp: Date.UTC(2026, 3, 21, 10, 0, 0),
};

const stage1: ContextGathererOutput = {
  input,
  context: {
    history: [],
    memories: [],
    time: {
      hour: 10,
      period: 'morning',
      dayType: 'weekday',
      isWeekend: false,
    },
    relationship: {
      stage: 'friend',
      trustScore: 0.7,
      daysTogether: 30,
      messageCount: 90,
      unresolvedTension: false,
    },
    persona: {
      id: 'persona-1',
      name: 'Ashim',
      systemInstruction: 'Be practical.',
      emotionalDebt: 20,
    },
  },
};

const stage2: IdentityResolverOutput = {
  ...stage1,
  identity: {
    variant: 'morning_self',
    confidence: 0.88,
    energy: 0.79,
    reasons: ['morning context'],
  },
};

const stage3: EmotionalProcessorOutput = {
  ...stage2,
  emotional: {
    surface: { label: 'calm', intensity: 0.45, rationale: 'baseline' },
    felt: { label: 'calm', intensity: 0.52, rationale: 'stable' },
    suppressed: { label: 'anxiety', intensity: 0.2, rationale: 'minor pressure' },
    unconscious: { label: 'calm', intensity: 0.3, rationale: 'secure' },
    emotionalDebt: 20,
    dischargeRisk: 0.31,
  },
};

const stage4: PromptBuilderOutput = {
  ...stage3,
  prompt: {
    systemInstruction: 'system instruction',
    tiers: {
      immutableCore: 'core',
      sessionDiff: 'diff',
      contextualRetrieval: 'context',
      estimatedTokens: 120,
      cprActive: true,
    },
  },
};

const stage5: LLMCallerOutput = {
  ...stage4,
  llm: {
    text: 'Start with one measurable weekly outcome and write it in a single sentence. Build three daily actions that directly drive that outcome and schedule them at fixed times. Remove every low-impact task from your calendar for the next five days so focus is protected. Review progress each evening with a simple scorecard and adjust the next day based on what failed.',
    chunks: [],
    cancelled: false,
    timedOut: false,
    providerId: 'mock',
    model: 'mock-chat',
  },
};

describe('PipelineOrchestrator', () => {
  it('runs stages 1-7 end-to-end and returns humanized messages', async () => {
    const orchestrator = new PipelineOrchestrator({
      contextGatherer: { name: 'contextGatherer', run: async () => stage1 },
      identityResolver: { name: 'identityResolver', run: async () => stage2 },
      emotionalProcessor: { name: 'emotionalProcessor', run: async () => stage3 },
      promptBuilder: { name: 'promptBuilder', run: async () => stage4 },
      llmCaller: { name: 'llmCaller', run: async () => stage5 },
      humanizer: createHumanizer(),
      learner: createLearner({
        persistMemory: async () => Promise.resolve(),
        emitGrowthEvents: async () => Promise.resolve(),
      }),
    });

    const result = await orchestrator.run(input);

    expect(result.humanized.messages.length).toBeGreaterThanOrEqual(2);
    expect(result.humanized.messages.length).toBeLessThanOrEqual(4);
    expect(result.humanized.messages[0].delayBefore).toBeGreaterThan(0);
    expect(result.humanized.messages[0].typingDuration).toBeGreaterThan(0);
  });

  it('retries retryable llm errors and succeeds on next attempt', async () => {
    const llmRun = vi
      .fn()
      .mockRejectedValueOnce(new Error('network timeout'))
      .mockResolvedValueOnce(stage5);

    const orchestrator = new PipelineOrchestrator({
      contextGatherer: { name: 'contextGatherer', run: async () => stage1 },
      identityResolver: { name: 'identityResolver', run: async () => stage2 },
      emotionalProcessor: { name: 'emotionalProcessor', run: async () => stage3 },
      promptBuilder: { name: 'promptBuilder', run: async () => stage4 },
      llmCaller: { name: 'llmCaller', run: llmRun },
      humanizer: createHumanizer(),
      learner: createLearner({
        persistMemory: async () => Promise.resolve(),
        emitGrowthEvents: async () => Promise.resolve(),
      }),
    });

    const result = await orchestrator.run(input, { maxRetries: 1, retryDelayMs: 1 });

    expect(llmRun).toHaveBeenCalledTimes(2);
    expect(result.llm.text.length).toBeGreaterThan(0);
  });

  it('wraps stage failure with PipelineExecutionError', async () => {
    const orchestrator = new PipelineOrchestrator({
      contextGatherer: { name: 'contextGatherer', run: async () => stage1 },
      identityResolver: { name: 'identityResolver', run: async () => stage2 },
      emotionalProcessor: {
        name: 'emotionalProcessor',
        run: async () => {
          throw new Error('unexpected');
        },
      },
      promptBuilder: { name: 'promptBuilder', run: async () => stage4 },
      llmCaller: { name: 'llmCaller', run: async () => stage5 },
      humanizer: createHumanizer(),
      learner: createLearner({
        persistMemory: async () => Promise.resolve(),
        emitGrowthEvents: async () => Promise.resolve(),
      }),
    });

    await expect(orchestrator.run(input)).rejects.toBeInstanceOf(PipelineExecutionError);
  });
});
