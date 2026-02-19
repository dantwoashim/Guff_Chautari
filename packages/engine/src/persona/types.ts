import type { PersonaAspect } from '../pipeline/types';

export interface PersonaRuntimeState {
  identityVariant: string;
  identityConfidence: number;
  energy: number;
  relationshipStage: string;
  trustScore: number;
  emotionalSummary: string;
  timePeriod: string;
}

export interface DifferentialLoaderInput {
  personaId: string;
  sessionId: string;
  systemInstruction: string;
  aspects: ReadonlyArray<PersonaAspect>;
  runtimeState: PersonaRuntimeState;
  userMessage: string;
  recentHistory: ReadonlyArray<string>;
  memoryHints?: ReadonlyArray<string>;
}

export interface DifferentialTierOutput {
  immutableCore: string;
  immutableCoreCacheId: string;
  coreCacheReused: boolean;
  sessionDiff: string;
  contextualRetrieval: string;
  selectedAspectIds: string[];
  estimatedTokens: number;
  cprActive: boolean;
}

export interface PersonaGraphNode {
  id: string;
  title: string;
  content: string;
  keywords: ReadonlyArray<string>;
  estimatedTokens: number;
}

export interface PersonaGraphEdge {
  from: string;
  to: string;
  weight: number;
}

export interface PersonaRetrievalResult {
  nodes: PersonaGraphNode[];
  totalEstimatedTokens: number;
}

export interface PersonaDriftSample {
  prompt: string;
  response: string;
}

export interface PersonaDriftReport {
  sampleCount: number;
  consistencyScore: number;
  averageSimilarity: number;
  lowestSimilarity: number;
  highestSimilarity: number;
}
