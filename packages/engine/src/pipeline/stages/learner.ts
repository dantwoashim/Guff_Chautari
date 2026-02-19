import {
  computeSeasonalState,
  updateRelationshipState,
  type AttachmentStyle,
  type RelationshipState,
  type RepairAction,
} from '../../relationship';
import { buildDeterministicEmbedding, createProvenanceLinks } from '../../memory';
import { runReflectionSession, shouldRunReflection } from '../../reflection';
import { memoryRepository } from '../../../data';
import type {
  HumanizerOutput,
  LearnedMemory,
  LearnerOutput,
  PersonaGrowthEvent,
  PipelineStage,
  RelationshipUpdate,
} from '../types';

interface LearnerDependencies {
  persistMemory: (payload: Record<string, unknown>) => Promise<void>;
  emitGrowthEvents: (events: PersonaGrowthEvent[]) => Promise<void>;
  embedText: (text: string) => Promise<ReadonlyArray<number>>;
  reflectionEnabled: boolean;
  reflectionEveryNMessages: number;
  reflectionMinMessages: number;
  now: () => number;
}

const defaultDependencies: LearnerDependencies = {
  persistMemory: (payload) => memoryRepository.upsertMemory(payload),
  emitGrowthEvents: async () => Promise.resolve(),
  embedText: async (text) => buildDeterministicEmbedding(text),
  reflectionEnabled: true,
  reflectionEveryNMessages: 12,
  reflectionMinMessages: 20,
  now: () => Date.now(),
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

const tokenize = (value: string): string[] => {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 4);
};

const idFromText = (prefix: string, text: string, index: number): string => {
  const normalized = text.slice(0, 24).replace(/[^a-z0-9]/gi, '').toLowerCase();
  const hash = Math.abs(
    tokenize(text).reduce((accumulator, token) => {
      let sum = accumulator;
      for (const char of token) {
        sum = (sum * 31 + char.charCodeAt(0)) | 0;
      }
      return sum;
    }, 7)
  );
  return `${prefix}-${normalized || 'memory'}-${hash}-${index}`;
};

const salienceScore = (text: string): number => {
  const keywords = ['need', 'goal', 'important', 'remember', 'always', 'never', 'launch', 'deadline'];
  const lowered = text.toLowerCase();
  const hits = keywords.filter((keyword) => lowered.includes(keyword)).length;
  const lengthBoost = Math.min(0.4, text.length / 400);
  return clamp(0.3 + hits * 0.12 + lengthBoost, 0, 1);
};

const splitSentences = (text: string): string[] => {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  return normalized
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 20)
    .slice(0, 4);
};

const extractMemories = (input: HumanizerOutput): LearnedMemory[] => {
  const candidates: LearnedMemory[] = [];

  const userSentences = splitSentences(input.input.userMessage.text);
  userSentences.forEach((sentence, index) => {
    candidates.push({
      id: idFromText('usr', sentence, index),
      content: sentence,
      type: 'episodic',
      salience: salienceScore(sentence),
      source: 'user',
    });
  });

  const modelSentences = splitSentences(input.llm.text);
  modelSentences.forEach((sentence, index) => {
    candidates.push({
      id: idFromText('asst', sentence, index),
      content: sentence,
      type: 'semantic',
      salience: salienceScore(sentence),
      source: 'assistant',
    });
  });

  if (candidates.length === 0) {
    candidates.push({
      id: idFromText('usr', input.input.userMessage.text, 0),
      content: input.input.userMessage.text.trim(),
      type: 'episodic',
      salience: 0.4,
      source: 'user',
    });
  }

  return candidates
    .filter((item) => item.content.length > 0)
    .sort((left, right) => right.salience - left.salience)
    .slice(0, 3);
};

const detectRepairActions = (text: string): RepairAction[] => {
  const lowered = text.toLowerCase();
  const actions: RepairAction[] = [];

  if (lowered.includes('sorry') || lowered.includes('apolog')) {
    actions.push('apology');
  }
  if (lowered.includes('i know i hurt') || lowered.includes('i understand')) {
    actions.push('acknowledge_harm');
  }
  if (lowered.includes('i will') || lowered.includes('next time') || lowered.includes('i changed')) {
    actions.push('behavior_change');
    actions.push('follow_through');
  }
  if (lowered.includes('checking in')) {
    actions.push('check_in');
  }

  return [...new Set(actions)];
};

const countSignals = (text: string, tokens: string[]): number => {
  const lowered = text.toLowerCase();
  return tokens.filter((token) => lowered.includes(token)).length;
};

const toRelationshipState = (input: HumanizerOutput): RelationshipState => {
  const style = (input.context.persona.attachmentStyle ?? 'secure') as AttachmentStyle;
  return {
    stage: input.context.relationship.stage,
    trustScore: input.context.relationship.trustScore,
    messageCount: input.context.relationship.messageCount,
    daysTogether: input.context.relationship.daysTogether,
    unresolvedConflict: input.context.relationship.unresolvedTension,
    attachmentStyle: style,
    repairProgress: 0,
    seasonal: computeSeasonalState(input.context.relationship.messageCount),
  };
};

const computeRelationshipUpdate = (input: HumanizerOutput): RelationshipUpdate => {
  const previousState = toRelationshipState(input);

  const mergedText = `${input.input.userMessage.text} ${input.llm.text}`;
  const positiveSignals = countSignals(mergedText, ['thanks', 'appreciate', 'love', 'trust', 'great']);
  const negativeSignals = countSignals(mergedText, ['angry', 'upset', 'frustrated', 'hurt', 'disappointed']);
  const repairActions = detectRepairActions(input.input.userMessage.text);

  const nextState = updateRelationshipState(previousState, {
    positiveSignals,
    negativeSignals,
    conflictTriggered: input.context.relationship.unresolvedTension && repairActions.length === 0,
    silenceHours: input.context.time.period === 'late_night' ? 10 : 2,
    repairActions,
    daysElapsed: 1,
  });

  return {
    stage: nextState.stage,
    trustDelta: Number((nextState.trustScore - previousState.trustScore).toFixed(4)),
    rationale: `state_machine from ${previousState.stage} to ${nextState.stage}; repair_actions=${repairActions.length}`,
  };
};

const buildGrowthEvents = (input: HumanizerOutput, now: number): PersonaGrowthEvent[] => {
  const events: PersonaGrowthEvent[] = [];

  if (input.emotional.dischargeRisk >= 0.65) {
    events.push({
      id: `growth-boundary-${now}`,
      kind: 'boundary_adjustment',
      description: 'High emotional load suggests boundary recalibration for future turns.',
      queuedAt: now,
    });
  }

  if (input.identity.variant === 'stressed_self') {
    events.push({
      id: `growth-style-${now}`,
      kind: 'style_shift',
      description: 'Stress-state communication style reinforced as contextual adaptation.',
      queuedAt: now,
    });
  }

  if (input.input.userMessage.text.trim().length > 0) {
    events.push({
      id: `growth-interest-${now}`,
      kind: 'interest_update',
      description: 'User message topic stored for preference and topic graph updates.',
      queuedAt: now,
    });
  }

  return events;
};

const toRepositoryPayload = (
  input: HumanizerOutput,
  memory: LearnedMemory,
  embedding: ReadonlyArray<number>,
  now: number
): Record<string, unknown> => {
  const provenance = createProvenanceLinks(memory.id, [
    {
      id: input.input.userMessage.id,
      threadId: input.input.threadId,
      role: 'user',
      text: input.input.userMessage.text,
      timestamp: input.input.userMessage.timestamp,
    },
    ...(memory.source === 'assistant'
      ? [
          {
            id: `assistant-turn-${input.input.threadId}-${now}`,
            threadId: input.input.threadId,
            role: 'model',
            text: input.llm.text,
            timestamp: now,
          },
        ]
      : []),
  ]);

  return {
    id: memory.id,
    user_id: input.input.userId,
    content: memory.content,
    type: memory.type,
    embedding,
    timestamp: now,
    decay_factor: 0,
    connections: [],
    emotional_valence: input.emotional.felt.intensity,
    metadata: {
      source: memory.source,
      threadId: input.input.threadId,
      salience: memory.salience,
      source_message_ids: provenance.map((link) => link.messageId),
      provenance,
      accessCount: 1,
    },
  };
};

export const createLearner = (
  partialDependencies: Partial<LearnerDependencies> = {}
): PipelineStage<HumanizerOutput, LearnerOutput> => {
  const dependencies: LearnerDependencies = {
    ...defaultDependencies,
    ...partialDependencies,
  };

  return {
    name: 'learner',
    async run(input: HumanizerOutput): Promise<LearnerOutput> {
      const now = dependencies.now();
      const extractedMemories = extractMemories(input);
      const relationshipUpdate = computeRelationshipUpdate(input);
      let growthEvents = buildGrowthEvents(input, now);
      const embeddings = await Promise.all(
        extractedMemories.map(async (memory) => dependencies.embedText(memory.content))
      );

      await Promise.all(
        extractedMemories.map(async (memory, index) => {
          await dependencies.persistMemory(
            toRepositoryPayload(input, memory, embeddings[index], now)
          );
        })
      );

      let reflectionSummary: LearnerOutput['learner']['reflection'] | undefined;
      if (
        dependencies.reflectionEnabled &&
        shouldRunReflection(input.context.relationship.messageCount + 1, {
          minConversationMessages: dependencies.reflectionMinMessages,
          reflectionEveryNMessages: dependencies.reflectionEveryNMessages,
        })
      ) {
        const reflectionSession = runReflectionSession({
          threadId: input.input.threadId,
          personaId: input.input.personaId,
          messages: [
            ...input.context.history,
            input.input.userMessage,
            {
              id: `reflection-model-${now}`,
              role: 'model',
              text: input.llm.text,
              timestamp: now,
            },
          ],
          now,
          config: {
            minConversationMessages: dependencies.reflectionMinMessages,
            reflectionEveryNMessages: dependencies.reflectionEveryNMessages,
            maxWindow: 40,
          },
        });

        reflectionSummary = {
          sessionId: reflectionSession.id,
          generatedAt: reflectionSession.createdAt,
          observationCount: reflectionSession.observations.length,
          observations: reflectionSession.observations.map((item) => item.summary),
          patternCount: reflectionSession.patterns.length,
          evolution: reflectionSession.evolution,
        };

        const reflectionGrowthEvents: PersonaGrowthEvent[] = reflectionSession.evolution.vocabularyAdds.map(
          (word, index) => ({
            id: `growth-reflection-${now}-${index}`,
            kind: 'interest_update',
            description: `Reflection promoted vocabulary/interest token: ${word}`,
            queuedAt: now,
          })
        );
        growthEvents = [...growthEvents, ...reflectionGrowthEvents].slice(0, 8);
      }

      void dependencies.emitGrowthEvents(growthEvents);

      return {
        ...input,
        learner: {
          extractedMemories,
          relationshipUpdate,
          growthEvents,
          reflection: reflectionSummary,
        },
      };
    },
  };
};

export const learner = createLearner();
