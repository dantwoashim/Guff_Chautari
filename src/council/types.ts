export type CouncilPerspectiveStyle =
  | 'analytical'
  | 'empathetic'
  | 'skeptical'
  | 'creative'
  | 'execution_focused';

export interface CouncilMember {
  id: string;
  personaId: string;
  name: string;
  roleHint?: string;
  systemInstruction?: string;
  stanceSeed: number;
}

export interface Council {
  id: string;
  userId: string;
  name: string;
  description?: string;
  members: CouncilMember[];
  createdAtIso: string;
  updatedAtIso: string;
}

export interface PerspectiveResponse {
  id: string;
  councilId: string;
  memberId: string;
  memberName: string;
  style: CouncilPerspectiveStyle;
  prompt: string;
  response: string;
  actionBias: string;
  createdAtIso: string;
  durationMs: number;
}

export interface SynthesizedRecommendation {
  id: string;
  councilId: string;
  prompt: string;
  consensus: string;
  minorityView: string;
  recommendedAction: string;
  confidence: number;
  agreements: string[];
  disagreements: string[];
  references: Array<{
    memberId: string;
    memberName: string;
    style: CouncilPerspectiveStyle;
  }>;
  createdAtIso: string;
}

export interface CouncilDebateResult {
  council: Council;
  prompt: string;
  perspectives: PerspectiveResponse[];
  synthesis: SynthesizedRecommendation;
  durationMs: number;
}

export interface CouncilStoreState {
  councils: Council[];
  updatedAtIso: string;
}

export interface CouncilStoreAdapter {
  load: (userId: string) => CouncilStoreState;
  save: (userId: string, state: CouncilStoreState) => void;
}

export interface CouncilMemberInput {
  personaId: string;
  name: string;
  roleHint?: string;
  systemInstruction?: string;
}

export interface CreateCouncilInput {
  userId: string;
  name: string;
  description?: string;
  members: ReadonlyArray<CouncilMemberInput>;
  nowIso?: string;
}

export interface GeneratePerspectivesInput {
  council: Council;
  prompt: string;
  nowIso?: string;
}

export interface SynthesizeCouncilInput {
  council: Council;
  prompt: string;
  perspectives: ReadonlyArray<PerspectiveResponse>;
  nowIso?: string;
}
