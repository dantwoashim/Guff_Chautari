export interface VoiceForensicsProfile {
  [key: string]: unknown;
}

export interface PersonaCommunicationModel {
  signaturePhrases?: string[];
  emojiUsage?: 'none' | 'rare' | 'occasional' | 'frequent';
  [key: string]: unknown;
}

export interface PersonaBehaviorModel {
  [key: string]: unknown;
}

export interface PersonaContextModel {
  [key: string]: unknown;
}

export interface PersonaPsychologyModel {
  [key: string]: unknown;
}

export interface PersonaEmotionalStatesModel {
  baseline_state?: string;
  [key: string]: unknown;
}

export type PersonaContradiction = Record<string, unknown>;

export interface PersonaLivingLifeModel {
  [key: string]: unknown;
}

export interface PersonaQuantumEmotionModel {
  [key: string]: unknown;
}

export interface PersonaChaosFactorModel {
  [key: string]: unknown;
}
