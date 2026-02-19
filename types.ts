
import type {
  PersonaBehaviorModel,
  PersonaChaosFactorModel,
  PersonaCommunicationModel,
  PersonaContextModel,
  PersonaContradiction,
  PersonaEmotionalStatesModel,
  PersonaLivingLifeModel,
  PersonaPsychologyModel,
  PersonaQuantumEmotionModel,
  VoiceForensicsProfile,
} from './src/domain/types/persona';
import type { MemoryMetadata } from './src/domain/types/memory';
import type { AmbientDataPayload, PreemptiveActionResult } from './src/domain/types/ambient';
import type { CommunicationPreferences } from './src/domain/types/dna';

export type Role = 'user' | 'model';

export interface Attachment {
  id: string;
  type: 'image' | 'video' | 'file' | 'audio';
  mimeType: string;
  url: string;
  data?: string; // Base64
  metadata?: {
    name?: string;
    size?: number;
    duration?: number;
  };
}

export interface Reaction {
  emoji: string;
  count: number;
  userReacted: boolean;
}

export interface Message {
  id: string;
  role: Role;
  text: string;
  timestamp: number;
  attachments?: Attachment[];
  replyToId?: string;
  status?: 'queued' | 'sending' | 'sent' | 'delivered' | 'read' | 'error';
  isTyping?: boolean;
  isError?: boolean;
  isImageGenerating?: boolean;
  reactions?: Reaction[];
  isStarred?: boolean;
  isPinned?: boolean;
  isChunked?: boolean;
  chunkIndex?: number;
  totalChunks?: number;
  generationLogs?: string[];
  isSpontaneous?: boolean;
}

export interface Content {
  role: string;
  parts: { text?: string; inlineData?: { mimeType: string; data: string } }[];
}

export interface Conversation {
  id: string;
  persona_id: string;
  persona: Persona;
  workspace_id?: string | null;
  visibility?: 'personal' | 'workspace';
  participant_user_ids?: string[];
  last_message_text?: string;
  last_message_at?: string;
  unread_count: number;
  is_pinned: boolean;
  is_muted: boolean;
  is_archived?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  timestamp: number | string;
  messages: Message[];
  session_id?: string | null;
  user_id?: string;
  // Compatibility fields for UI
  persona?: Persona;
  unread_count?: number;
  is_pinned?: boolean;
  is_muted?: boolean;
  is_archived?: boolean;
}

export interface ReferenceAsset {
  id: string;
  url: string;
  mimeType: string;
  type: 'image' | 'video';
  name: string;
}

export interface AssetAlbum {
  id: string;
  name: string;
  assets: ReferenceAsset[];
  createdAt: number;
}

export interface CharacterModel {
  id: string;
  name: string;
  archetype: string;
  description: string;
  visualUrl: string;
  createdAt: number;
  facialGeometry?: string;
}

export interface InstructionPreset {
  id: string;
  user_id: string;
  name: string;
  content: string;
  created_at?: string;
}

export interface VoiceProfile {
  id: string;
  name: string;
  description: string;
  forensics: VoiceForensicsProfile;
  createdAt: number;
}

export interface VoiceMemory {
  id: string;
  text: string;
  audioData: string;
  category: string;
  createdAt: number;
}

export interface Persona {
  id: string;
  user_id: string;
  name: string;
  description: string;
  system_instruction: string;
  avatar_url?: string;
  created_at?: string;
  status_text?: string;
  is_online?: boolean;
}

// Living Persona Types
export interface PersonaCore {
  name: string;
  relationship?: string;
  ageRange?: string;
  background?: string;
  essenceDescription: string;
  emotionalBaseline: {
    defaultMood: string;
    energyLevel: string;
    warmthLevel: number;
    directnessLevel: number;
  };
}

export interface LivingPersona {
  id: string;
  version: string;
  createdAt: number;
  updatedAt: number;
  core: PersonaCore;
  communication: PersonaCommunicationModel;
  behavior: PersonaBehaviorModel;
  context: PersonaContextModel;
  psychology?: PersonaPsychologyModel;
  emotional_states?: PersonaEmotionalStatesModel;
  contradictions?: PersonaContradiction[];
  living_life?: PersonaLivingLifeModel;
  quantum_emotions?: PersonaQuantumEmotionModel;
  chaos_factors?: PersonaChaosFactorModel;
  rawInstruction?: string;
  compiledPrompt: string;
  processingNotes?: string[];
  confidenceScore: number;
}

export interface InferredPersona {
  name?: string;
  confidence: number;
  communicationStyle: StyleMetrics;
  interestGraph: InterestNode[];
  decisionPatterns: DecisionPattern[];
}

export interface StyleMetrics {
  technical: number;
  casual: number;
  analytical: number;
  creative: number;
  empathetic: number;
}

export interface InterestNode {
  topic: string;
  frequency: number;
  attraction: number;
}

export interface EmotionalPattern {
  // Placeholder for emotional pattern structure
  type: string;
  intensity: number;
}

export interface DecisionPattern {
  category: string;
  style: string;
  examples: string[];
}

export interface ChatConfig {
  systemInstruction: string;
  model: string;
  imageModel?: string; // ADDED: Specific model for image generation
  thinkingBudget?: number;
  temperature?: number;
  personaId?: string; // ADDED: For per-persona reference images
  livingPersona?: LivingPersona;
  personaAvatarUrl?: string; // For background response notifications
  referenceAssets?: ReferenceAsset[];
  characterModels?: CharacterModel[];
  ttsVoice?: string;
  mirrorDepth?: number;
  proactiveInterruptionLevel?: number;
  thoughtTopics?: string[];
  quietHoursStart?: string;
  quietHoursEnd?: string;
  dreamFrequencyPerDay?: number;
  dreamPreferredTypes?: string[];
  dreamNotificationStyle?: string;
  consciousnessEnabled?: boolean;
  showConsciousnessIndicator?: boolean;
  dreamModeEnabled?: boolean;
  oracleEnabled?: boolean;
  agiContext?: string;
}

// Memory Types
export type MemoryType = 'episodic' | 'semantic' | 'emotional' | 'procedural';

export interface Memory {
  id: string;
  content: string;
  type: MemoryType;
  embedding: number[];
  timestamp: number;
  decayFactor: number;
  connections: string[];
  emotionalValence: number;
  metadata: MemoryMetadata;
}

export interface MemoryCluster {
  id: string;
  label: string;
  centroid: number[];
  memoryIds: string[];
  lastAccessed: number;
}

// Consciousness Types
export interface ConsciousnessState {
  currentThoughts: string[];
  ambientInputs: AmbientInput[];
  pendingInsights: Insight[];
  emotionalState: {
    valence: number;
    arousal: number;
    dominance: number;
    currentMood: string;
  };
}

export interface AmbientInput {
  type: string;
  data: AmbientDataPayload;
  timestamp: number;
}

export interface Insight {
  id: string;
  content: string;
  urgency: number;
  relevance: number;
  createdAt: number;
}

export interface ProactiveMessage {
  id: string;
  content: string;
  triggerCondition: string;
  priority: number;
  expiresAt: number;
}

// Branching Types
export interface ConversationBranch {
  id: string;
  parentId?: string;
  forkPoint: number;
  messages: Message[];
  label: string;
  createdAt: number;
}

export interface ConversationTree {
  rootId: string;
  branches: Record<string, ConversationBranch>;
  activeBranchId: string;
}

export interface BranchComparison {
  branchA: string;
  branchB: string;
  divergencePoint: number;
  keyDifferences: string[];
  mergedInsights: string;
  recommendedPath: 'A' | 'B' | 'merged';
}

// Dream Types
export type DreamArtifactType = 'image' | 'audio' | 'text' | 'code';

export interface DreamArtifact {
  type: DreamArtifactType;
  content: string;
  description: string;
  prompt: string;
}

export interface Dream {
  id: string;
  user_id: string;
  themes: string[];
  artifacts: DreamArtifact[];
  emotionalTone: string;
  sourceConversations: string[];
  createdAt: number;
}

export interface DreamContext {
  recentConversations: Message[];
  memories: Memory[];
  emotionalTone: string;
  timeContext: string;
}

// Oracle Types
export type PredictionType = 'topic' | 'mood' | 'need' | 'decision';

export interface Prediction {
  id: string;
  type: PredictionType;
  content: string;
  confidence: number;
  timeframe: string;
  evidence: string[];
  suggestedAction: string;
  was_accurate?: boolean;
}

export interface PreemptiveAction {
  id: string;
  description: string;
  status: 'pending' | 'completed' | 'failed';
  result?: PreemptiveActionResult;
}

// DNA Types
export interface CognitiveDNA {
  id: string;
  userId: string;
  version: string;
  exportedAt: number;
  communicationPreferences?: CommunicationPreferences;
  learnedContext?: string;
  interactionPatterns?: string[];
  signature: string;
}

export interface PersonaProcessingResult {
  success: boolean;
  persona?: LivingPersona;
  errors?: string[];
  warnings?: string[];
  processingTime: number;
}
