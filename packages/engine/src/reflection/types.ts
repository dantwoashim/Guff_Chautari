import type { Message } from '../../../types';

export interface GrowthInsight {
  id: string;
  summary: string;
  evidence: string[];
  confidence: number;
}

export type BehaviorPatternKind = 'topic' | 'emotion' | 'relationship' | 'linguistic';

export interface BehaviorPattern {
  id: string;
  kind: BehaviorPatternKind;
  label: string;
  occurrences: number;
  trend: 'rising' | 'stable' | 'falling';
}

export interface PersonaEvolution {
  vocabularyAdds: string[];
  interestsAdded: string[];
  stanceAdjustments: string[];
}

export interface ReflectionSession {
  id: string;
  threadId: string;
  personaId: string;
  createdAt: number;
  windowSize: number;
  observations: GrowthInsight[];
  patterns: BehaviorPattern[];
  evolution: PersonaEvolution;
}

export interface ReflectionConfig {
  minConversationMessages: number;
  reflectionEveryNMessages: number;
  maxWindow: number;
}

export interface ReflectionInput {
  threadId: string;
  personaId: string;
  messages: ReadonlyArray<Message>;
  now: number;
  config?: Partial<ReflectionConfig>;
}
