import type { ApprovalRequest, PolicyDecisionRecord } from '../policy';

export type WorkflowStepKind = 'connector' | 'transform' | 'artifact' | 'checkpoint';
export type WorkflowStepStatus =
  | 'idle'
  | 'running'
  | 'completed'
  | 'failed'
  | 'approval_required'
  | 'checkpoint_required';
export type WorkflowExecutionStatus =
  | 'running'
  | 'completed'
  | 'failed'
  | 'approval_required'
  | 'checkpoint_required';
export type WorkflowTriggerType = 'manual' | 'schedule' | 'event';
export type WorkflowEventType = 'new_message' | 'keyword_match';
export type WorkflowPolicyActionType =
  | 'connector_read'
  | 'connector_mutation'
  | 'transform'
  | 'artifact'
  | 'checkpoint';
export type BranchConditionOperator =
  | 'string_equals'
  | 'string_contains'
  | 'number_compare'
  | 'regex_match'
  | 'exists'
  | 'not_exists';
export type NumberComparator = 'gt' | 'gte' | 'lt' | 'lte' | 'eq';

export interface WorkflowTriggerSchedule {
  intervalMinutes: number;
  nextRunAtIso: string;
  cronLike: string;
}

export interface WorkflowTriggerEvent {
  eventType: WorkflowEventType;
  keyword?: string;
}

export interface WorkflowTrigger {
  id: string;
  type: WorkflowTriggerType;
  enabled: boolean;
  schedule?: WorkflowTriggerSchedule;
  event?: WorkflowTriggerEvent;
}

export interface WorkflowStep {
  id: string;
  title: string;
  description: string;
  kind: WorkflowStepKind;
  actionId: string;
  inputTemplate?: string;
  status: WorkflowStepStatus;
}

export interface CheckpointProposedAction {
  title: string;
  description: string;
  actionId: string;
  inputTemplate?: string;
}

export type WorkflowCheckpointRiskLevel = 'low' | 'medium' | 'high';
export type WorkflowCheckpointStatus = 'pending' | 'approved' | 'rejected' | 'edited' | 'resumed';
export type WorkflowCheckpointDecision = 'approve' | 'reject' | 'edit';

export interface WorkflowCheckpointRequest {
  id: string;
  userId: string;
  workflowId: string;
  executionId: string;
  checkpointStepId: string;
  status: WorkflowCheckpointStatus;
  createdAtIso: string;
  decidedAtIso?: string;
  decisionByUserId?: string;
  decision?: WorkflowCheckpointDecision;
  rejectionReason?: string;
  riskLevel: WorkflowCheckpointRiskLevel;
  riskSummary: string;
  proposedAction: CheckpointProposedAction;
  editedAction?: CheckpointProposedAction;
  previousStepResults: StepResult[];
  remainingStepIds: string[];
  resumedExecutionId?: string;
}

export interface BranchCondition {
  id: string;
  sourcePath: string;
  operator: BranchConditionOperator;
  value?: string | number | boolean;
  numberComparator?: NumberComparator;
  caseSensitive?: boolean;
  regexFlags?: string;
}

export interface ConditionalBranch {
  id: string;
  fromStepId: string;
  toStepId: string;
  label: string;
  priority: number;
  condition: BranchCondition;
}

export interface PlanGraph {
  entryStepId: string;
  branches: ConditionalBranch[];
}

export interface WorkflowPolicyBudget {
  maxTotalSteps?: number;
  maxConnectorCalls?: number;
  maxMutationCalls?: number;
  maxTransformCalls?: number;
  maxArtifactWrites?: number;
  maxEstimatedTokens?: number;
  maxRuntimeMs?: number;
}

export interface WorkflowPolicy {
  id: string;
  workflowId: string;
  allowedConnectorIds?: string[];
  blockedConnectorIds?: string[];
  allowedActionTypes?: WorkflowPolicyActionType[];
  budget?: WorkflowPolicyBudget;
  requireApprovalForMutations?: boolean;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface Workflow {
  id: string;
  userId: string;
  name: string;
  description: string;
  naturalLanguagePrompt: string;
  trigger: WorkflowTrigger;
  steps: WorkflowStep[];
  planGraph?: PlanGraph;
  policy?: WorkflowPolicy;
  status: 'draft' | 'ready' | 'paused';
  createdAtIso: string;
  updatedAtIso: string;
  lastExecutionId?: string;
}

export interface StepResult {
  id: string;
  workflowId: string;
  stepId: string;
  status: WorkflowStepStatus;
  startedAtIso: string;
  finishedAtIso: string;
  durationMs: number;
  outputSummary: string;
  outputPayload: Record<string, unknown>;
  errorMessage?: string;
  policyDecision?: PolicyDecisionRecord;
  approvalRequest?: ApprovalRequest;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  userId: string;
  status: WorkflowExecutionStatus;
  triggerType: WorkflowTriggerType;
  startedAtIso: string;
  finishedAtIso: string;
  durationMs: number;
  heartbeatAtIso?: string;
  stepResults: StepResult[];
  memoryNamespace: string;
  inboxArtifactId?: string;
}

export interface WorkflowInboxArtifact {
  id: string;
  userId: string;
  workflowId: string;
  executionId: string;
  title: string;
  body: string;
  status: WorkflowExecutionStatus;
  createdAtIso: string;
}

export interface WorkflowNotification {
  id: string;
  userId: string;
  workflowId: string;
  executionId: string;
  level: 'info' | 'warning' | 'error';
  message: string;
  status: WorkflowExecutionStatus;
  createdAtIso: string;
  read: boolean;
}

export interface WorkflowState {
  workflows: Workflow[];
  executions: WorkflowExecution[];
  artifacts: WorkflowInboxArtifact[];
  notifications: WorkflowNotification[];
  updatedAtIso: string;
}

export interface WorkflowStoreAdapter {
  load: (userId: string) => WorkflowState;
  save: (userId: string, state: WorkflowState) => void;
}

export interface WorkflowPlanInput {
  userId: string;
  prompt: string;
  nowIso?: string;
}

export interface WorkflowRunContext {
  userId: string;
  workflow: Workflow;
  triggerType: WorkflowTriggerType;
}

export interface WorkflowWorkerRequest {
  type: 'run';
  workflow: Workflow;
}

export interface WorkflowWorkerHeartbeatEvent {
  type: 'heartbeat';
  atIso: string;
}

export interface WorkflowWorkerCompletedEvent {
  type: 'completed';
  startedAtIso: string;
  finishedAtIso: string;
  stepResults: StepResult[];
}

export interface WorkflowWorkerFailedEvent {
  type: 'failed';
  startedAtIso: string;
  finishedAtIso: string;
  message: string;
  stepResults: StepResult[];
}

export interface WorkflowDeadLetterEntry {
  id: string;
  userId: string;
  workflowId: string;
  triggerType: WorkflowTriggerType;
  reason: string;
  startedAtIso: string;
  finishedAtIso: string;
  stepResults: StepResult[];
  retryCount: number;
  status: 'pending' | 'retrying' | 'resolved';
  createdAtIso: string;
  updatedAtIso: string;
}

export type WorkflowWorkerEvent =
  | WorkflowWorkerHeartbeatEvent
  | WorkflowWorkerCompletedEvent
  | WorkflowWorkerFailedEvent;
