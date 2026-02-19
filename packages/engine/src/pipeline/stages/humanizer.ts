import {
  applyImperfections,
  chunkResponseText,
  computeTimingPlan,
  planStrategicNonResponse,
  simulateReadReceiptDelay,
  simulateRevisionEvent,
} from '../../humanizer';
import type {
  HumanizerOutput,
  HumanizedMessage,
  LLMCallerOutput,
  PipelineStage,
  StrategicNonResponsePlan,
} from '../types';

interface HumanizerDependencies {
  chunkResponse: (text: string) => string[];
  addImperfections: (text: string, intensity: number, seed: number) => string;
  readDelay: (textLength: number, emotionalComplexity: number) => number;
  timing: (payload: {
    text: string;
    chunkIndex: number;
    emotionalComplexity: number;
    readDelay: number;
  }) => { delayBefore: number; typingDuration: number };
  revision: (payload: {
    text: string;
    emotionalComplexity: number;
    containsQuestion: boolean;
  }) => { shouldRevise: boolean; pauseMs: number; reason: string };
  strategicDelay: (payload: {
    relationshipStage: LLMCallerOutput['context']['relationship']['stage'];
    emotionalComplexity: number;
    unresolvedTension: boolean;
    period: LLMCallerOutput['context']['time']['period'];
  }) => StrategicNonResponsePlan;
}

const defaultDependencies: HumanizerDependencies = {
  chunkResponse: (text) => chunkResponseText(text, { minChunks: 1, maxChunks: 4, targetWordsPerChunk: 24 }),
  addImperfections: (text, intensity, seed) => applyImperfections(text, { intensity, seed, enabled: true }),
  readDelay: (textLength, emotionalComplexity) => simulateReadReceiptDelay(textLength, emotionalComplexity),
  timing: (payload) => computeTimingPlan(payload),
  revision: (payload) => simulateRevisionEvent(payload),
  strategicDelay: (payload) => planStrategicNonResponse(payload),
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

const makeMessages = (
  input: LLMCallerOutput,
  dependencies: HumanizerDependencies,
  emotionalComplexity: number
): HumanizedMessage[] => {
  const chunks = dependencies.chunkResponse(input.llm.text);
  if (chunks.length === 0) return [];

  return chunks.map((chunk, index) => {
    const imperfected = dependencies.addImperfections(
      chunk,
      clamp(0.1 + emotionalComplexity * 0.5, 0, 1),
      input.input.timestamp + index
    );

    const readDelay = dependencies.readDelay(imperfected.length, emotionalComplexity);
    const timing = dependencies.timing({
      text: imperfected,
      chunkIndex: index,
      emotionalComplexity,
      readDelay,
    });

    const temporalEnergy = input.context.temporal?.energyLevel ?? input.identity.energy;
    const energyAdjustedTypingDuration = Math.round(
      timing.typingDuration * (1 + clamp(0.55 - temporalEnergy, -0.2, 0.45))
    );

    const revision = dependencies.revision({
      text: imperfected,
      emotionalComplexity,
      containsQuestion: imperfected.includes('?'),
    });

    return {
      text: imperfected,
      chunkIndex: index,
      totalChunks: chunks.length,
      delayBefore: timing.delayBefore,
      typingDuration: Math.max(140, energyAdjustedTypingDuration),
      readDelay,
      revision,
    };
  });
};

export const createHumanizer = (
  partialDependencies: Partial<HumanizerDependencies> = {}
): PipelineStage<LLMCallerOutput, HumanizerOutput> => {
  const dependencies: HumanizerDependencies = {
    ...defaultDependencies,
    ...partialDependencies,
  };

  return {
    name: 'humanizer',
    async run(input: LLMCallerOutput): Promise<HumanizerOutput> {
      const emotionalComplexity = clamp(input.emotional.dischargeRisk, 0, 1);

      const messages = makeMessages(input, dependencies, emotionalComplexity);

      const strategicNonResponse = dependencies.strategicDelay({
        relationshipStage: input.context.relationship.stage,
        emotionalComplexity,
        unresolvedTension: input.context.relationship.unresolvedTension,
        period: input.context.time.period,
      });

      let finalStrategicDelay = strategicNonResponse;
      const temporalAvailability = input.context.temporal?.availability;
      if (temporalAvailability && !temporalAvailability.available) {
        finalStrategicDelay = {
          shouldDelay: true,
          delayMs: Math.max(
            strategicNonResponse.delayMs,
            temporalAvailability.suggestedDelayMs
          ),
          reason: `${strategicNonResponse.reason}; temporal=${temporalAvailability.reason}`,
        };
      }

      return {
        ...input,
        humanized: {
          messages,
          strategicNonResponse: finalStrategicDelay,
        },
      };
    },
  };
};

export const humanizer = createHumanizer();
