import type { Message, Persona } from '../../../types';

export type DayPeriod = 'morning' | 'afternoon' | 'evening' | 'late_night';
export type DayType = 'weekday' | 'weekend';
export type RelationshipStage =
  | 'stranger'
  | 'acquaintance'
  | 'friend'
  | 'close'
  | 'intimate';

export type IdentityVariant =
  | 'morning_self'
  | 'afternoon_self'
  | 'evening_self'
  | 'tired_self'
  | 'stressed_self'
  | 'baseline_self';

export type EmotionalLabel =
  | 'joy'
  | 'calm'
  | 'neutral'
  | 'affection'
  | 'anxiety'
  | 'frustration'
  | 'sadness';

export interface TimeContext {
  hour: number;
  period: DayPeriod;
  dayType: DayType;
  isWeekend: boolean;
}

export interface LinguisticSnapshot {
  profileId: string;
  activeRegister: 'casual' | 'balanced' | 'formal' | 'playful';
  directive: string;
  consistencyHints: string[];
  userPatterns: {
    sampleCount: number;
    avgSentenceLength: number;
    emojiRate: number;
    topTerms: string[];
    slangTerms: string[];
    summary: string;
  };
}

export interface TemporalSnapshot {
  energyLevel: number;
  availability: {
    available: boolean;
    mode: 'available' | 'busy' | 'away' | 'sleeping';
    reason: string;
    suggestedDelayMs: number;
  };
  schedule: {
    blockLabel: string;
    minutesToNextBlock: number;
    isWeekend: boolean;
  };
  activeEvents: Array<{
    id: string;
    title: string;
    moodShift: number;
    note?: string;
  }>;
}

export interface MemoryHit {
  id: string;
  content: string;
  type: string;
  score: number;
  emotionalValence: number;
  timestamp: number;
  timestampIso?: string;
  semanticScore?: number;
  recencyScore?: number;
  frequencyScore?: number;
  provenanceMessageIds?: string[];
}

export interface RelationshipSnapshot {
  stage: RelationshipStage;
  trustScore: number;
  daysTogether: number;
  messageCount: number;
  unresolvedTension: boolean;
}

export interface PipelinePersona {
  id: string;
  name: string;
  systemInstruction: string;
  compiledPrompt?: string;
  aspects?: PersonaAspect[];
  emotionalDebt?: number;
  attachmentStyle?: 'secure' | 'anxious' | 'avoidant' | 'disorganized';
}

export interface PersonaAspect {
  id: string;
  title: string;
  content: string;
  keywords: ReadonlyArray<string>;
  estimatedTokens: number;
}

export interface PipelineInput {
  threadId: string;
  userId: string;
  personaId: string;
  userMessage: Message;
  timestamp: number;
  abortSignal?: AbortSignal;
  provider?: string;
  model?: string;
  apiKey?: string;
  temperature?: number;
  persona?: PipelinePersona;
  pluginTools?: PluginToolRuntimeAdapter;
}

export interface PluginToolExecutionResult {
  ok: boolean;
  summary: string;
  data?: Record<string, unknown>;
  denied?: boolean;
}

export interface PluginToolRuntimeAdapter {
  allowedToolIds: string[];
  invoke: (
    toolId: string,
    payload: Record<string, unknown>
  ) => Promise<PluginToolExecutionResult>;
}

export interface GatheredContext {
  history: Message[];
  memories: MemoryHit[];
  time: TimeContext;
  relationship: RelationshipSnapshot;
  persona: PipelinePersona;
  linguistic?: LinguisticSnapshot;
  temporal?: TemporalSnapshot;
}

export interface ContextGathererOutput {
  input: PipelineInput;
  context: GatheredContext;
}

export interface ResolvedIdentity {
  variant: IdentityVariant;
  confidence: number;
  energy: number;
  reasons: string[];
}

export interface IdentityResolverOutput extends ContextGathererOutput {
  identity: ResolvedIdentity;
}

export interface EmotionalLayerState {
  label: EmotionalLabel;
  intensity: number;
  rationale: string;
}

export interface EmotionalState {
  surface: EmotionalLayerState;
  felt: EmotionalLayerState;
  suppressed: EmotionalLayerState;
  unconscious: EmotionalLayerState;
  emotionalDebt: number;
  dischargeRisk: number;
}

export interface EmotionalProcessorOutput extends IdentityResolverOutput {
  emotional: EmotionalState;
}

export interface PromptTiers {
  immutableCore: string;
  sessionDiff: string;
  contextualRetrieval: string;
  estimatedTokens: number;
  cprActive: boolean;
  immutableCoreCacheId?: string;
  coreCacheReused?: boolean;
  selectedAspectIds?: string[];
}

export interface PromptBuilderOutput extends EmotionalProcessorOutput {
  prompt: {
    systemInstruction: string;
    tiers: PromptTiers;
  };
}

export interface LLMChunk {
  text: string;
  index: number;
  isFinal: boolean;
  receivedAt: number;
}

export interface LLMCallResult {
  text: string;
  chunks: LLMChunk[];
  cancelled: boolean;
  timedOut: boolean;
  providerId: string;
  model: string;
}

export interface LLMCallerOutput extends PromptBuilderOutput {
  llm: LLMCallResult;
}

export interface RevisionEvent {
  shouldRevise: boolean;
  pauseMs: number;
  reason: string;
}

export interface HumanizedMessage {
  text: string;
  chunkIndex: number;
  totalChunks: number;
  delayBefore: number;
  typingDuration: number;
  readDelay: number;
  revision: RevisionEvent;
}

export interface StrategicNonResponsePlan {
  shouldDelay: boolean;
  delayMs: number;
  reason: string;
}

export interface HumanizedPlan {
  messages: HumanizedMessage[];
  strategicNonResponse: StrategicNonResponsePlan;
}

export interface HumanizerOutput extends LLMCallerOutput {
  humanized: HumanizedPlan;
}

export type LearnedMemoryType = 'episodic' | 'semantic' | 'emotional';

export interface LearnedMemory {
  id: string;
  content: string;
  type: LearnedMemoryType;
  salience: number;
  source: 'user' | 'assistant';
}

export interface RelationshipUpdate {
  stage: RelationshipStage;
  trustDelta: number;
  rationale: string;
}

export interface PersonaGrowthEvent {
  id: string;
  kind: 'style_shift' | 'boundary_adjustment' | 'interest_update';
  description: string;
  queuedAt: number;
}

export interface LearnerResult {
  extractedMemories: LearnedMemory[];
  relationshipUpdate: RelationshipUpdate;
  growthEvents: PersonaGrowthEvent[];
  reflection?: {
    sessionId: string;
    generatedAt: number;
    observationCount: number;
    observations: string[];
    patternCount: number;
    evolution: {
      vocabularyAdds: string[];
      interestsAdded: string[];
      stanceAdjustments: string[];
    };
  };
}

export interface LearnerOutput extends HumanizerOutput {
  learner: LearnerResult;
}

export interface PipelineStage<I, O> {
  name: string;
  run: (input: I) => Promise<O>;
}

export type PipelineMessage = Message;

export type PipelinePersonaSource = Persona & {
  compiledPrompt?: string;
  aspects?: PersonaAspect[];
  emotional_debt?: number;
  attachment_style?: 'secure' | 'anxious' | 'avoidant' | 'disorganized';
};
