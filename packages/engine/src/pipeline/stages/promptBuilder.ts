import { differentialPersonaLoader } from '../../persona';
import type {
  EmotionalProcessorOutput,
  PipelineStage,
  PromptBuilderOutput,
  PromptTiers,
} from '../types';

const summarizeEmotionalState = (input: EmotionalProcessorOutput): string => {
  const emotional = input.emotional;
  return [
    `surface=${emotional.surface.label}:${emotional.surface.intensity.toFixed(2)}`,
    `felt=${emotional.felt.label}:${emotional.felt.intensity.toFixed(2)}`,
    `suppressed=${emotional.suppressed.label}:${emotional.suppressed.intensity.toFixed(2)}`,
    `debt=${emotional.emotionalDebt.toFixed(0)}`,
    `risk=${emotional.dischargeRisk.toFixed(2)}`,
  ].join(', ');
};

export const createPromptBuilder = (): PipelineStage<EmotionalProcessorOutput, PromptBuilderOutput> => {
  return {
    name: 'promptBuilder',
    async run(input: EmotionalProcessorOutput): Promise<PromptBuilderOutput> {
      const tierOutput = differentialPersonaLoader.compose({
        personaId: input.context.persona.id,
        sessionId: input.input.threadId,
        systemInstruction:
          input.context.persona.systemInstruction ||
          'Stay coherent, grounded, practical, and emotionally aware.',
        aspects: input.context.persona.aspects ?? [],
        runtimeState: {
          identityVariant: input.identity.variant,
          identityConfidence: input.identity.confidence,
          energy: input.identity.energy,
          relationshipStage: input.context.relationship.stage,
          trustScore: input.context.relationship.trustScore,
          emotionalSummary: summarizeEmotionalState(input),
          timePeriod: input.context.time.period,
        },
        userMessage: input.input.userMessage.text,
        recentHistory: input.context.history.slice(-4).map((message) => message.text),
        memoryHints: input.context.memories.slice(0, 3).map((memory) => memory.content),
      });

      const tiers: PromptTiers = {
        immutableCore: tierOutput.immutableCore,
        sessionDiff: tierOutput.sessionDiff,
        contextualRetrieval: tierOutput.contextualRetrieval,
        estimatedTokens: tierOutput.estimatedTokens,
        cprActive: tierOutput.cprActive,
        immutableCoreCacheId: tierOutput.immutableCoreCacheId,
        coreCacheReused: tierOutput.coreCacheReused,
        selectedAspectIds: tierOutput.selectedAspectIds,
      };

      const systemInstruction = [
        '[CORE_PERSONA]',
        tiers.immutableCore,
        '',
        `[CORE_CACHE_ID] ${tiers.immutableCoreCacheId ?? 'none'}`,
        '',
        '[SESSION_STATE_DIFF]',
        tiers.sessionDiff,
        '',
        '[CONTEXTUAL_RETRIEVAL]',
        tiers.contextualRetrieval,
        '',
        '[LINGUISTIC_IDENTITY]',
        input.context.linguistic
          ? `register=${input.context.linguistic.activeRegister}\n` +
            `directive=${input.context.linguistic.directive}\n` +
            `user_idiolect=${input.context.linguistic.userPatterns.summary}\n` +
            `consistency_hints=${input.context.linguistic.consistencyHints.slice(0, 3).join(' | ')}`
          : 'No linguistic profile available.',
        '',
        '[TEMPORAL_CONTEXT]',
        input.context.temporal
          ? `availability=${input.context.temporal.availability.mode}, energy=${input.context.temporal.energyLevel.toFixed(2)}, block=${input.context.temporal.schedule.blockLabel}`
          : 'No temporal context available.',
        '',
        '[RESPONSE_DIRECTIVE]',
        'Respond naturally and remain consistent with persona, context, and emotional state.',
      ]
        .join('\n')
        .trim();

      return {
        ...input,
        prompt: {
          systemInstruction,
          tiers,
        },
      };
    },
  };
};

export const promptBuilder = createPromptBuilder();
