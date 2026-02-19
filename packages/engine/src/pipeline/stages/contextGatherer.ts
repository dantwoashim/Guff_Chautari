import type { Memory, Message, Persona } from '../../../../types';
import { memoryRepository, messageRepository, personaRepository } from '../../../data';
import { modelRouter } from '../../../providers';
import {
  buildDeterministicEmbedding,
  createProvenanceLinks,
  isoToUnixMs,
  memoryManager,
  toIsoTimestamp,
  type MemoryNode,
  type RetrievalScoredMemory,
} from '../../memory';
import {
  buildCodeSwitchDecision,
  createDefaultSociolinguisticProfile,
  learnIdiolectPatterns,
  summarizeIdiolect,
  summarizeLinguisticProfile,
} from '../../persona';
import {
  applyConversationLoad,
  computeAvailabilityWindow,
  createDefaultLifeEvents,
  createTemporalSchedule,
  getActiveLifeEvents,
  getEffectiveEnergy,
  initializeEnergyCycle,
  resolveScheduleState,
} from '../../temporal';
import type {
  ContextGathererOutput,
  DayPeriod,
  PipelineInput,
  PipelinePersona,
  PipelineStage,
  RelationshipSnapshot,
  TimeContext,
  MemoryHit,
} from '../types';

interface EmbedQueryInput {
  text: string;
  provider?: string;
  model?: string;
  apiKey?: string;
}

interface ContextGathererDependencies {
  loadHistory: (threadId: string) => Promise<Message[]>;
  loadPersona: (personaId: string) => Promise<PipelinePersona | null>;
  loadMemories: (userId: string, limit: number) => Promise<Memory[]>;
  embedQuery: (input: EmbedQueryInput) => Promise<ReadonlyArray<number>>;
  now: () => Date;
}

const DEFAULT_MEMORY_LIMIT = 24;

const defaultDependencies: ContextGathererDependencies = {
  loadHistory: (threadId) => messageRepository.getMessages(threadId),
  loadPersona: async (personaId) => {
    const persona = await personaRepository.getById(personaId);
    if (!persona) return null;
    return toPipelinePersona(persona);
  },
  loadMemories: (userId, limit) => memoryRepository.listRecentByUser(userId, limit),
  embedQuery: async ({ text, provider, model, apiKey }) => {
    try {
      const response = await modelRouter.embed({
        model: model ?? 'text-embedding-004',
        input: text,
        apiKey,
        preferredProviderId: provider,
        allowFallback: true,
      });

      const vector = response.vectors[0];
      if (Array.isArray(vector) && vector.length > 0) {
        return vector;
      }
    } catch {
      // Fall through to deterministic embedding.
    }

    return buildDeterministicEmbedding(text);
  },
  now: () => new Date(),
};

const toPipelinePersona = (persona: Persona): PipelinePersona => {
  return {
    id: persona.id,
    name: persona.name,
    systemInstruction: persona.system_instruction || persona.description,
  };
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

const inferDayPeriod = (hour: number): DayPeriod => {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'late_night';
};

const buildTimeContext = (timestamp: number): TimeContext => {
  const date = new Date(timestamp);
  const hour = date.getUTCHours();
  const day = date.getUTCDay();

  return {
    hour,
    period: inferDayPeriod(hour),
    dayType: day === 0 || day === 6 ? 'weekend' : 'weekday',
    isWeekend: day === 0 || day === 6,
  };
};

const inferRelationshipStage = (messageCount: number): RelationshipSnapshot['stage'] => {
  if (messageCount < 5) return 'stranger';
  if (messageCount < 20) return 'acquaintance';
  if (messageCount < 80) return 'friend';
  if (messageCount < 250) return 'close';
  return 'intimate';
};

const hasTension = (messages: Message[]): boolean => {
  const tensionPattern = /(angry|upset|fight|argue|disappointed|ignored|hurt|sorry)/i;
  const recent = messages.slice(-8);
  return recent.some((message) => tensionPattern.test(message.text));
};

const buildRelationshipSnapshot = (history: Message[], now: Date): RelationshipSnapshot => {
  const messageCount = history.length;
  const firstTimestamp = history.reduce<number>((oldest, message) => {
    if (!Number.isFinite(message.timestamp)) return oldest;
    return Math.min(oldest, message.timestamp);
  }, Number.isFinite(history[0]?.timestamp ?? NaN) ? history[0].timestamp : now.getTime());

  const daysTogether = Math.max(1, Math.ceil((now.getTime() - firstTimestamp) / (24 * 60 * 60 * 1000)));
  const trustScore = clamp(0.2 + Math.log10(messageCount + 1) * 0.35, 0.05, 0.98);

  return {
    stage: inferRelationshipStage(messageCount),
    trustScore,
    daysTogether,
    messageCount,
    unresolvedTension: hasTension(history),
  };
};

const memoryFromRetrieved = (entry: RetrievalScoredMemory): MemoryHit => {
  return {
    id: entry.memory.id,
    content: entry.memory.content,
    type: entry.memory.type,
    score: entry.score,
    emotionalValence: entry.memory.emotionalValence,
    timestamp: isoToUnixMs(entry.memory.timestampIso),
    timestampIso: entry.memory.timestampIso,
    semanticScore: entry.breakdown.semantic,
    recencyScore: entry.breakdown.recency,
    frequencyScore: entry.breakdown.frequency,
    provenanceMessageIds: entry.memory.provenance.map((link) => link.messageId),
  };
};

const historyMessageToMemoryNode = (
  message: Message,
  index: number,
  input: PipelineInput,
  nowIso: string
): MemoryNode => {
  const memoryId = `history-${message.id || index}`;

  return {
    id: memoryId,
    userId: input.userId,
    type: 'episodic',
    content: message.text,
    embedding: buildDeterministicEmbedding(message.text),
    timestampIso: toIsoTimestamp(message.timestamp, nowIso),
    emotionalValence: message.role === 'user' ? 0.1 : 0,
    accessCount: 1,
    decayFactor: 0.5,
    metadata: {
      source: 'history',
      threadId: input.threadId,
    },
    provenance: createProvenanceLinks(memoryId, [
      {
        id: message.id,
        threadId: input.threadId,
        role: message.role,
        text: message.text,
        timestamp: message.timestamp,
      },
    ]),
  };
};

const repositoryMemoryToNode = (
  memory: Memory,
  input: PipelineInput,
  nowIso: string,
  index: number
): MemoryNode => {
  const node = memoryManager.normalizeRecord(
    {
      ...memory,
      id: memory.id || `memory-${index}`,
      user_id: input.userId,
      created_at: memory.timestamp,
      access_count:
        typeof memory.metadata?.accessCount === 'number' ? Number(memory.metadata.accessCount) : 1,
    },
    input.userId
  );

  return {
    ...node,
    timestampIso: toIsoTimestamp(node.timestampIso, nowIso),
  };
};

const fallbackMemoryFromInput = (persona: PipelinePersona, input: PipelineInput): MemoryHit[] => {
  return [
    {
      id: 'fallback-user-message',
      content: input.userMessage.text,
      type: 'episodic',
      score: 0.3,
      emotionalValence: 0,
      timestamp: input.timestamp,
      timestampIso: toIsoTimestamp(input.timestamp),
      semanticScore: 0,
      recencyScore: 1,
      frequencyScore: 0,
      provenanceMessageIds: [input.userMessage.id],
    },
    {
      id: 'fallback-persona-core',
      content: `${persona.name}: ${persona.systemInstruction.slice(0, 220)}`,
      type: 'semantic',
      score: 0.28,
      emotionalValence: 0,
      timestamp: input.timestamp,
      timestampIso: toIsoTimestamp(input.timestamp),
      semanticScore: 0,
      recencyScore: 1,
      frequencyScore: 0,
      provenanceMessageIds: [],
    },
  ];
};

const buildLinguisticSnapshot = (personaId: string, history: Message[], userMessage: Message) => {
  const profile = createDefaultSociolinguisticProfile(personaId, 'balanced');
  const decision = buildCodeSwitchDecision(profile, userMessage.text);
  const idiolect = learnIdiolectPatterns(history.slice(-80));
  const profileSummary = summarizeLinguisticProfile(profile);
  const idiolectSummary = summarizeIdiolect(idiolect);

  return {
    profileId: profile.id,
    activeRegister: decision.register,
    directive: decision.directive,
    consistencyHints: [...profileSummary.consistencyHints, ...decision.reasons],
    userPatterns: {
      sampleCount: idiolect.sampleCount,
      avgSentenceLength: idiolect.avgSentenceLength,
      emojiRate: idiolect.emojiRate,
      topTerms: idiolect.topTerms,
      slangTerms: idiolect.slangTerms,
      summary: idiolectSummary,
    },
  };
};

const buildTemporalSnapshot = (timestamp: number) => {
  const schedule = createTemporalSchedule('default');
  const scheduleState = resolveScheduleState(schedule, timestamp);
  const energyCycle = initializeEnergyCycle(timestamp);
  const loadedEnergy = applyConversationLoad(energyCycle, 1, timestamp);
  const energyLevel = getEffectiveEnergy(loadedEnergy, timestamp);
  const availability = computeAvailabilityWindow(scheduleState, energyLevel);
  const activeEvents = getActiveLifeEvents(createDefaultLifeEvents(timestamp), timestamp);

  return {
    energyLevel,
    availability,
    schedule: {
      blockLabel: scheduleState.currentBlock.label,
      minutesToNextBlock: scheduleState.minutesToNextBlock,
      isWeekend: scheduleState.isWeekend,
    },
    activeEvents: activeEvents.map((event) => ({
      id: event.id,
      title: event.title,
      moodShift: event.moodShift,
      note: event.note,
    })),
  };
};

export const createContextGatherer = (
  partialDependencies: Partial<ContextGathererDependencies> = {}
): PipelineStage<PipelineInput, ContextGathererOutput> => {
  const dependencies: ContextGathererDependencies = {
    ...defaultDependencies,
    ...partialDependencies,
  };

  return {
    name: 'contextGatherer',
    async run(input: PipelineInput): Promise<ContextGathererOutput> {
      const [history, personaRecord, memoryRows] = await Promise.all([
        dependencies.loadHistory(input.threadId),
        input.persona ? Promise.resolve(input.persona) : dependencies.loadPersona(input.personaId),
        dependencies.loadMemories(input.userId, DEFAULT_MEMORY_LIMIT),
      ]);

      const persona =
        personaRecord ??
        input.persona ?? {
          id: input.personaId,
          name: 'Unknown Persona',
          systemInstruction: 'Respond naturally and remain context-aware.',
        };

      const now = dependencies.now();
      const nowIso = now.toISOString();

      const repositoryMemories = memoryRows
        .filter((memory) => typeof memory.content === 'string' && memory.content.trim().length > 0)
        .map((memory, index) => repositoryMemoryToNode(memory, input, nowIso, index));

      const historyMemories = history
        .filter((message) => message.text.trim().length > 0)
        .slice(-12)
        .map((message, index) => historyMessageToMemoryNode(message, index, input, nowIso));

      const queryEmbedding = await dependencies.embedQuery({
        text: input.userMessage.text,
        provider: input.provider,
        model: input.model,
        apiKey: input.apiKey,
      });

      const retrieval = await memoryManager.retrieveRelevant({
        query: input.userMessage.text,
        memories: [...repositoryMemories, ...historyMemories],
        queryEmbedding,
        nowIso,
        limit: 10,
      });

      const retrievedHits = retrieval.selected.map(memoryFromRetrieved);
      const fallbackHits = fallbackMemoryFromInput(persona, input);

      const memories = [...retrievedHits, ...fallbackHits]
        .sort((left, right) => right.score - left.score)
        .slice(0, 10);

      return {
        input,
        context: {
          history,
          memories,
          time: buildTimeContext(input.timestamp),
          relationship: buildRelationshipSnapshot(history, now),
          persona,
          linguistic: buildLinguisticSnapshot(persona.id, history, input.userMessage),
          temporal: buildTemporalSnapshot(input.timestamp),
        },
      };
    },
  };
};

export const contextGatherer = createContextGatherer();
