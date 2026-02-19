import type { ConnectorInvocationOutcome } from '../connectors';
import type { Workflow } from '../workflows';

export type MeetingSpeakerRole = 'host' | 'participant' | 'assistant' | 'system';
export type MeetingSessionStatus = 'active' | 'ended';
export type MeetingTranscriptSource = 'audio' | 'manual' | 'imported';

export interface TranscriptSegment {
  id: string;
  sessionId: string;
  speaker: MeetingSpeakerRole;
  text: string;
  source: MeetingTranscriptSource;
  startedAtIso: string;
  endedAtIso: string;
}

export interface MeetingDecision {
  id: string;
  text: string;
  confidence: number;
  sourceSegmentId?: string;
}

export interface MeetingActionItem {
  id: string;
  text: string;
  confidence: number;
  assignee?: string;
  deadlineIso?: string;
  sourceSegmentId?: string;
}

export interface MeetingQuestion {
  id: string;
  text: string;
  resolved: boolean;
  sourceSegmentId?: string;
}

export interface MeetingTopic {
  id: string;
  label: string;
  score: number;
}

export interface MeetingActionExtraction {
  decisions: MeetingDecision[];
  actionItems: MeetingActionItem[];
  questions: MeetingQuestion[];
  topics: MeetingTopic[];
  method: 'heuristic' | 'structured_llm' | 'hybrid';
  generatedAtIso: string;
}

export interface MeetingNote {
  id: string;
  sessionId: string;
  summary: string;
  generatedAtIso: string;
  decisionCount: number;
  actionItemCount: number;
}

export interface MeetingSession {
  id: string;
  userId: string;
  workspaceId?: string;
  title: string;
  status: MeetingSessionStatus;
  createdAtIso: string;
  updatedAtIso: string;
  endedAtIso?: string;
  segments: TranscriptSegment[];
  extracted?: MeetingActionExtraction;
  notes: MeetingNote[];
}

export interface MeetingFollowUpExecution {
  createdWorkflows: Workflow[];
  connectorInvocations: ConnectorInvocationOutcome[];
  generatedEmailDrafts: Array<{
    actionItemId: string;
    draftSubject: string;
    draftBody: string;
    workflowId: string;
  }>;
  scheduledEvents: Array<{
    actionItemId: string;
    invoked: boolean;
    reason?: string;
  }>;
}

