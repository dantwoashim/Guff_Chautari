import type { RelationshipStage, RevisionEvent, StrategicNonResponsePlan } from '../pipeline/types';

export interface ChunkerOptions {
  minChunks?: number;
  maxChunks?: number;
  targetWordsPerChunk?: number;
}

export interface TimingInput {
  text: string;
  chunkIndex: number;
  emotionalComplexity: number;
  readDelay: number;
}

export interface TimingResult {
  delayBefore: number;
  typingDuration: number;
}

export interface RevisionInput {
  text: string;
  emotionalComplexity: number;
  containsQuestion: boolean;
}

export interface StrategicNonResponseInput {
  relationshipStage: RelationshipStage;
  emotionalComplexity: number;
  unresolvedTension: boolean;
  period: 'morning' | 'afternoon' | 'evening' | 'late_night';
}

export interface ImperfectionOptions {
  enabled?: boolean;
  intensity?: number;
  seed?: number;
}

export interface HumanizerComputationInput {
  text: string;
  emotionalComplexity: number;
  relationshipStage: RelationshipStage;
  unresolvedTension: boolean;
  period: 'morning' | 'afternoon' | 'evening' | 'late_night';
}

export interface HumanizedChunk {
  text: string;
  chunkIndex: number;
  totalChunks: number;
  delayBefore: number;
  typingDuration: number;
  readDelay: number;
  revision: RevisionEvent;
}

export interface HumanizedComputationResult {
  messages: HumanizedChunk[];
  strategicNonResponse: StrategicNonResponsePlan;
}
