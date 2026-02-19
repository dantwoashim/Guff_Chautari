import type { Council, CouncilMember } from '../council/types';

export type DebatePosition = 'support' | 'oppose' | 'neutral' | 'mixed';
export type BoardroomSessionStatus = 'draft' | 'running' | 'completed' | 'failed';
export type DebateTurnMode = 'round_robin' | 'moderator_directed';
export type TurnRecordStatus = 'completed' | 'timed_out' | 'failed';

export interface BoardroomTurnLimits {
  maxTokensPerTurn: number;
  maxDurationMsPerTurn: number;
}

export interface BoardroomSession {
  id: string;
  userId: string;
  councilId: string;
  framingPrompt: string;
  mode: DebateTurnMode;
  roundCount: number;
  limits: BoardroomTurnLimits;
  status: BoardroomSessionStatus;
  startedAtIso: string;
  completedAtIso?: string;
}

export interface Argument {
  id: string;
  sessionId: string;
  councilId: string;
  memberId: string;
  memberName: string;
  round: number;
  turnIndex: number;
  position: DebatePosition;
  claim: string;
  supportingEvidence: string[];
  confidence: number;
  counterArgumentToId?: string;
  prompt: string;
  rawResponse: string;
  createdAtIso: string;
}

export interface CounterArgument extends Argument {
  counterArgumentToId: string;
}

export interface TurnRecord {
  id: string;
  sessionId: string;
  round: number;
  turnIndex: number;
  memberId: string;
  memberName: string;
  roleHint?: string;
  prompt: string;
  position: DebatePosition;
  evidence: string[];
  confidence: number;
  argumentId?: string;
  tokenLimit: number;
  timeLimitMs: number;
  tokensUsed: number;
  startedAtIso: string;
  completedAtIso: string;
  durationMs: number;
  status: TurnRecordStatus;
}

export interface AgreementMatrixCell {
  memberAId: string;
  memberBId: string;
  alignment: number;
  averageConfidence: number;
  roundsCompared: number;
}

export interface ConsensusScore {
  sessionId: string;
  councilId: string;
  rawAlignment: number;
  score: number;
  agreementMatrix: AgreementMatrixCell[];
  convergenceZones: string[];
  unresolvedTensions: string[];
  scoredAtIso: string;
}

export interface StructuredArgumentPayload {
  position: DebatePosition;
  claim: string;
  evidence: string[];
  confidence: number;
  counterArgumentToId?: string;
}

export interface DebatePipelineRequest {
  session: BoardroomSession;
  council: Council;
  member: CouncilMember;
  round: number;
  turnIndex: number;
  prompt: string;
  priorArguments: ReadonlyArray<Argument>;
  tokenLimit: number;
  timeLimitMs: number;
  provider?: string;
  model?: string;
  apiKey?: string;
}

export interface DebatePipelineResponse {
  text: string;
  providerId?: string;
  model?: string;
}

export type DebatePipelineRunner = (
  request: DebatePipelineRequest
) => Promise<DebatePipelineResponse>;

export interface DebateOrchestratorInput {
  session: BoardroomSession;
  council: Council;
  moderatorSequence?: ReadonlyArray<string>;
  pipelineRunner?: DebatePipelineRunner;
  provider?: string;
  model?: string;
  apiKey?: string;
  nowIso?: string;
}

export interface DebateOrchestrationResult {
  session: BoardroomSession;
  turnRecords: TurnRecord[];
  arguments: Argument[];
  durationMs: number;
}
