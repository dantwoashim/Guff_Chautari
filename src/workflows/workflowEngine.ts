import { connectorRegistry, ConnectorRegistry } from '../connectors';
import { policyEngine, type ApprovalRequest, type PolicyEvaluationResult } from '../policy';
import { emitActivityEvent } from '../activity';
import { ingestKnowledgeNote } from '../knowledge';
import { executeWorkflowStep } from './stepExecutor';
import { WorkflowStore, workflowStore } from './store';
import { publishWorkflowNotification } from './workflowNotifications';
import { planWorkflowFromPrompt } from './workflowPlanner';
import { WorkflowMemoryScope, workflowMemoryScope } from './workflowMemory';
import {
  WorkflowCheckpointManager,
  workflowCheckpointManager,
} from './checkpointManager';
import {
  WorkflowChangeHistory,
  workflowChangeHistory,
  type WorkflowChangeEntry,
  type WorkflowChangeDiff,
} from './changeHistory';
import {
  createEmptyWorkflowPolicyUsage,
  evaluateWorkflowStepPolicy,
  withWorkflowPolicy,
  type WorkflowPolicyUsage,
} from './workflowPolicy';
import type {
  CheckpointProposedAction,
  StepResult,
  Workflow,
  WorkflowCheckpointDecision,
  WorkflowCheckpointRequest,
  WorkflowExecution,
  WorkflowExecutionStatus,
  WorkflowPlanInput,
  WorkflowTriggerType,
} from './types';

interface WorkflowEngineOptions {
  store?: WorkflowStore;
  registry?: ConnectorRegistry;
  memoryScope?: WorkflowMemoryScope;
  checkpointManager?: WorkflowCheckpointManager;
  changeHistory?: WorkflowChangeHistory;
  nowIso?: () => string;
}

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

const statusFromStep = (result: StepResult): WorkflowExecutionStatus => {
  if (result.status === 'completed') return 'completed';
  if (result.status === 'approval_required') return 'approval_required';
  if (result.status === 'checkpoint_required') return 'checkpoint_required';
  return 'failed';
};

const artifactBodyFromResults = (results: ReadonlyArray<StepResult>): string => {
  if (results.length === 0) return 'Workflow finished with no output.';
  const last = results[results.length - 1];
  const fromPayload = last.outputPayload.artifactBody;
  if (typeof fromPayload === 'string' && fromPayload.trim().length > 0) {
    return fromPayload;
  }
  return results.map((result) => `${result.stepId}: ${result.outputSummary}`).join('\n');
};

const advanceScheduleTrigger = (
  workflow: Workflow,
  triggerType: WorkflowTriggerType,
  referenceIso: string
): Workflow['trigger'] => {
  if (triggerType !== 'schedule') {
    return workflow.trigger;
  }

  if (workflow.trigger.type !== 'schedule' || !workflow.trigger.schedule) {
    return workflow.trigger;
  }

  const intervalMinutes = Math.max(1, workflow.trigger.schedule.intervalMinutes);
  const referenceMs = Date.parse(referenceIso);
  const baseMs = Number.isNaN(referenceMs) ? Date.now() : referenceMs;
  const nextRunAtIso = new Date(baseMs + intervalMinutes * 60 * 1000).toISOString();

  return {
    ...workflow.trigger,
    schedule: {
      ...workflow.trigger.schedule,
      nextRunAtIso,
    },
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
};

const normalizeEditedAction = (
  base: CheckpointProposedAction,
  edited?: Partial<CheckpointProposedAction>
): CheckpointProposedAction => {
  if (!edited) return base;

  return {
    title: edited.title?.trim() || base.title,
    description: edited.description?.trim() || base.description,
    actionId: edited.actionId?.trim() || base.actionId,
    inputTemplate:
      edited.inputTemplate !== undefined
        ? edited.inputTemplate
        : base.inputTemplate,
  };
};

const statusToEventType = (status: WorkflowExecutionStatus): string => {
  if (status === 'completed') return 'workflow.completed';
  if (status === 'checkpoint_required') return 'workflow.checkpoint_required';
  if (status === 'approval_required') return 'workflow.approval_required';
  return 'workflow.failed';
};

const statusDescription = (status: WorkflowExecutionStatus): string => {
  if (status === 'completed') return 'completed';
  if (status === 'checkpoint_required') return 'paused for checkpoint review';
  if (status === 'approval_required') return 'paused for approval';
  return 'failed';
};

export class WorkflowEngine {
  private readonly store: WorkflowStore;
  private readonly registry: ConnectorRegistry;
  private readonly memoryScope: WorkflowMemoryScope;
  private readonly checkpointManager: WorkflowCheckpointManager;
  private readonly changeHistory: WorkflowChangeHistory;
  private readonly nowIso: () => string;

  constructor(options: WorkflowEngineOptions = {}) {
    this.store = options.store ?? workflowStore;
    this.registry = options.registry ?? connectorRegistry;
    this.memoryScope = options.memoryScope ?? workflowMemoryScope;
    this.checkpointManager = options.checkpointManager ?? workflowCheckpointManager;
    this.changeHistory = options.changeHistory ?? workflowChangeHistory;
    this.nowIso = options.nowIso ?? (() => new Date().toISOString());
  }

  createFromPrompt(input: WorkflowPlanInput): Workflow {
    const workflow = planWorkflowFromPrompt(input);
    return this.saveWorkflow(input.userId, workflow);
  }

  saveWorkflow(userId: string, workflow: Workflow): Workflow {
    const previous = this.store.getWorkflow(userId, workflow.id);
    const nowIso = this.nowIso();
    const normalized = withWorkflowPolicy({
      ...workflow,
      userId,
      updatedAtIso: nowIso,
    }, nowIso);
    const saved = this.store.upsertWorkflow(userId, normalized);

    this.changeHistory.recordWorkflowSave({
      userId,
      workflowId: saved.id,
      before: previous ?? undefined,
      after: saved,
      summary: previous
        ? `Workflow ${saved.name} plan updated.`
        : `Workflow ${saved.name} created.`,
      createdAtIso: saved.updatedAtIso,
    });

    return saved;
  }

  listWorkflows(userId: string): Workflow[] {
    return this.store.listWorkflows(userId);
  }

  getWorkflow(userId: string, workflowId: string): Workflow | null {
    return this.store.getWorkflow(userId, workflowId);
  }

  listExecutions(userId: string, workflowId?: string): WorkflowExecution[] {
    return this.store.listExecutions(userId, workflowId);
  }

  listArtifacts(userId: string) {
    return this.store.listArtifacts(userId);
  }

  listNotifications(userId: string) {
    return this.store.listNotifications(userId);
  }

  markNotificationRead(userId: string, notificationId: string): void {
    this.store.markNotificationRead(userId, notificationId);
  }

  listPendingCheckpoints(userId: string): WorkflowCheckpointRequest[] {
    return this.checkpointManager.list(userId, 'pending');
  }

  listCheckpointRequests(userId: string): WorkflowCheckpointRequest[] {
    return this.checkpointManager.list(userId);
  }

  listChangeHistory(payload: { userId: string; workflowId?: string; limit?: number }): WorkflowChangeEntry[] {
    return this.changeHistory.list(payload);
  }

  diffChangeEntries(payload: {
    left: WorkflowChangeEntry;
    right: WorkflowChangeEntry;
  }): WorkflowChangeDiff {
    return this.changeHistory.diffEntrySnapshots(payload);
  }

  pauseWorkflow(params: { userId: string; workflowId: string }): Workflow {
    const workflow = this.store.getWorkflow(params.userId, params.workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${params.workflowId} not found.`);
    }

    const saved = this.saveWorkflow(params.userId, {
      ...workflow,
      status: 'paused',
      trigger: {
        ...workflow.trigger,
        enabled: false,
      },
    });

    emitActivityEvent({
      userId: params.userId,
      category: 'workflow',
      eventType: 'workflow.paused',
      title: 'Workflow paused',
      description: `${saved.name} was paused from agent dashboard.`,
      metadata: {
        workflowId: saved.id,
      },
    });

    return saved;
  }

  resumeWorkflow(params: { userId: string; workflowId: string }): Workflow {
    const workflow = this.store.getWorkflow(params.userId, params.workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${params.workflowId} not found.`);
    }

    const saved = this.saveWorkflow(params.userId, {
      ...workflow,
      status: 'ready',
      trigger: {
        ...workflow.trigger,
        enabled: true,
      },
    });

    emitActivityEvent({
      userId: params.userId,
      category: 'workflow',
      eventType: 'workflow.resumed',
      title: 'Workflow resumed',
      description: `${saved.name} resumed and is eligible to run.`,
      metadata: {
        workflowId: saved.id,
      },
    });

    return saved;
  }

  cancelWorkflow(params: { userId: string; workflowId: string; reason?: string }): Workflow {
    const workflow = this.pauseWorkflow({
      userId: params.userId,
      workflowId: params.workflowId,
    });

    const nowIso = this.nowIso();
    this.store.appendNotification(params.userId, {
      id: makeId('wf-notification'),
      userId: params.userId,
      workflowId: workflow.id,
      executionId: workflow.lastExecutionId ?? 'manual-cancel',
      level: 'warning',
      message: params.reason?.trim()
        ? `Workflow cancelled: ${params.reason.trim()}`
        : 'Workflow cancelled from agent dashboard.',
      status: 'failed',
      createdAtIso: nowIso,
      read: false,
    });

    emitActivityEvent({
      userId: params.userId,
      category: 'workflow',
      eventType: 'workflow.cancelled',
      title: 'Workflow cancelled',
      description: `${workflow.name} was cancelled.`,
      metadata: {
        workflowId: workflow.id,
      },
    });

    return workflow;
  }

  runWorkflowById(params: {
    userId: string;
    workflowId: string;
    triggerType?: WorkflowTriggerType;
  }): Promise<WorkflowExecution> {
    const workflow = this.store.getWorkflow(params.userId, params.workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${params.workflowId} not found.`);
    }
    if (workflow.status === 'paused') {
      throw new Error(`Workflow ${params.workflowId} is paused.`);
    }
    return this.runWorkflow({
      userId: params.userId,
      workflow,
      triggerType: params.triggerType ?? 'manual',
    });
  }

  async runStepById(params: {
    userId: string;
    workflowId: string;
    stepId: string;
  }): Promise<WorkflowExecution> {
    const workflow = this.store.getWorkflow(params.userId, params.workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${params.workflowId} not found.`);
    }
    if (workflow.status === 'paused') {
      throw new Error(`Workflow ${params.workflowId} is paused.`);
    }
    const workflowWithPolicy = withWorkflowPolicy(workflow, this.nowIso());

    const targetIndex = workflowWithPolicy.steps.findIndex((step) => step.id === params.stepId);
    if (targetIndex === -1) {
      throw new Error(`Step ${params.stepId} not found in workflow ${workflow.id}.`);
    }

    emitActivityEvent({
      userId: params.userId,
      category: 'workflow',
      eventType: 'workflow.started',
      title: 'Workflow started',
      description: `${workflowWithPolicy.name} started (manual step run).`,
      metadata: {
        workflowId: workflowWithPolicy.id,
        triggerType: 'manual',
      },
    });

    const stepResults: StepResult[] = [];
    let policyUsage: WorkflowPolicyUsage = createEmptyWorkflowPolicyUsage();
    for (let index = 0; index <= targetIndex; index += 1) {
      const step = workflowWithPolicy.steps[index];
      const decision = evaluateWorkflowStepPolicy({
        policy: workflowWithPolicy.policy!,
        usage: policyUsage,
        step,
      });
      if (!decision.allowed) {
        stepResults.push(
          this.buildPolicyViolationStepResult({
            workflow: workflowWithPolicy,
            step,
            message: decision.message,
          })
        );
        break;
      }
      policyUsage = decision.projectedUsage;

      const result = await executeWorkflowStep({
        userId: params.userId,
        workflow: workflowWithPolicy,
        step,
        previousResults: stepResults,
        registry: this.registry,
        nowIso: this.nowIso(),
      });
      stepResults.push(result);
      if (result.status !== 'completed') break;
    }

    const status = statusFromStep(stepResults[stepResults.length - 1]);
    return this.commitExecution({
      userId: params.userId,
      workflow: workflowWithPolicy,
      triggerType: 'manual',
      stepResults,
      status,
      startedAtIso: stepResults[0]?.startedAtIso ?? this.nowIso(),
      finishedAtIso: this.nowIso(),
    });
  }

  async runWorkflow(params: {
    userId: string;
    workflow: Workflow;
    triggerType: WorkflowTriggerType;
  }): Promise<WorkflowExecution> {
    if (params.workflow.status === 'paused') {
      throw new Error(`Workflow ${params.workflow.id} is paused.`);
    }
    const startedAtIso = this.nowIso();
    const workflow = withWorkflowPolicy(params.workflow, startedAtIso);
    const stepResults: StepResult[] = [];
    let policyUsage: WorkflowPolicyUsage = createEmptyWorkflowPolicyUsage();
    let status: WorkflowExecutionStatus = 'completed';

    emitActivityEvent({
      userId: params.userId,
      category: 'workflow',
      eventType: 'workflow.started',
      title: 'Workflow started',
      description: `${workflow.name} started via ${params.triggerType} trigger.`,
      metadata: {
        workflowId: workflow.id,
        triggerType: params.triggerType,
      },
    });

    for (const step of workflow.steps) {
      const decision = evaluateWorkflowStepPolicy({
        policy: workflow.policy!,
        usage: policyUsage,
        step,
      });
      if (!decision.allowed) {
        stepResults.push(
          this.buildPolicyViolationStepResult({
            workflow,
            step,
            message: decision.message,
          })
        );
        status = 'failed';
        break;
      }
      policyUsage = decision.projectedUsage;

      const result = await executeWorkflowStep({
        userId: params.userId,
        workflow,
        step,
        previousResults: stepResults,
        registry: this.registry,
        nowIso: this.nowIso(),
      });

      stepResults.push(result);
      if (result.status !== 'completed') {
        status = statusFromStep(result);
        break;
      }
    }

    const finishedAtIso = this.nowIso();
    return this.commitExecution({
      userId: params.userId,
      workflow,
      triggerType: params.triggerType,
      stepResults,
      status,
      startedAtIso,
      finishedAtIso,
    });
  }

  async resolveCheckpoint(params: {
    userId: string;
    requestId: string;
    reviewerUserId: string;
    decision: WorkflowCheckpointDecision;
    rejectionReason?: string;
    editedAction?: Partial<CheckpointProposedAction>;
  }): Promise<{ checkpoint: WorkflowCheckpointRequest; execution?: WorkflowExecution }> {
    const request = this.checkpointManager.getById(params.userId, params.requestId);
    if (!request) {
      throw new Error(`Checkpoint request ${params.requestId} not found.`);
    }
    if (request.status !== 'pending' && request.status !== 'edited') {
      throw new Error(`Checkpoint request ${params.requestId} is not actionable.`);
    }

    const baseProposedAction = request.proposedAction;
    const editedAction = normalizeEditedAction(baseProposedAction, params.editedAction);

    const decidedCheckpoint = this.checkpointManager.resolve({
      userId: params.userId,
      requestId: params.requestId,
      reviewerUserId: params.reviewerUserId,
      decision: params.decision,
      rejectionReason: params.rejectionReason,
      editedAction: params.decision === 'edit' ? editedAction : undefined,
      nowIso: this.nowIso(),
    });

    this.changeHistory.append({
      userId: params.userId,
      workflowId: request.workflowId,
      changeType: 'checkpoint_decision',
      summary: `Checkpoint ${request.id} decision: ${params.decision}.`,
      metadata: {
        requestId: request.id,
        decision: params.decision,
        reviewerUserId: params.reviewerUserId,
        rejectionReason: params.rejectionReason,
      },
      createdAtIso: this.nowIso(),
    });

    if (params.decision === 'reject') {
      emitActivityEvent({
        userId: params.userId,
        category: 'workflow',
        eventType: 'workflow.checkpoint_rejected',
        title: 'Checkpoint rejected',
        description: `Checkpoint ${request.id} was rejected.`,
        metadata: {
          workflowId: request.workflowId,
          requestId: request.id,
        },
      });
      return {
        checkpoint: decidedCheckpoint,
      };
    }

    const workflow = this.store.getWorkflow(params.userId, request.workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${request.workflowId} not found.`);
    }
    const workflowWithPolicy = withWorkflowPolicy(workflow, this.nowIso());

    const stepById = new Map(workflowWithPolicy.steps.map((step) => [step.id, step]));
    const startedAtIso = this.nowIso();

    const previousResults = [...request.previousStepResults];
    const resumedResults: StepResult[] = [];
    let policyUsage = previousResults.reduce<WorkflowPolicyUsage>((usage, result) => {
      const step = stepById.get(result.stepId);
      if (!step || result.status !== 'completed') return usage;
      const decision = evaluateWorkflowStepPolicy({
        policy: workflowWithPolicy.policy!,
        usage,
        step,
      });
      return decision.projectedUsage;
    }, createEmptyWorkflowPolicyUsage());

    for (let index = 0; index < request.remainingStepIds.length; index += 1) {
      const stepId = request.remainingStepIds[index];
      const originalStep = stepById.get(stepId);
      if (!originalStep) continue;

      const step =
        index === 0 && params.decision === 'edit'
          ? {
              ...originalStep,
              title: editedAction.title,
              description: editedAction.description,
              actionId: editedAction.actionId,
              inputTemplate: editedAction.inputTemplate,
            }
          : originalStep;

      const policyDecision = evaluateWorkflowStepPolicy({
        policy: workflowWithPolicy.policy!,
        usage: policyUsage,
        step,
      });
      if (!policyDecision.allowed) {
        const violation = this.buildPolicyViolationStepResult({
          workflow: workflowWithPolicy,
          step,
          message: policyDecision.message,
        });
        resumedResults.push(violation);
        previousResults.push(violation);
        break;
      }
      policyUsage = policyDecision.projectedUsage;

      const result = await executeWorkflowStep({
        userId: params.userId,
        workflow: workflowWithPolicy,
        step,
        previousResults,
        registry: this.registry,
        nowIso: this.nowIso(),
      });

      resumedResults.push(result);
      previousResults.push(result);

      if (result.status !== 'completed') {
        break;
      }
    }

    const status: WorkflowExecutionStatus =
      resumedResults.length === 0
        ? 'completed'
        : statusFromStep(resumedResults[resumedResults.length - 1]);

    const execution = this.commitExecution({
      userId: params.userId,
      workflow: workflowWithPolicy,
      triggerType: workflowWithPolicy.trigger.type,
      stepResults: resumedResults,
      status,
      startedAtIso,
      finishedAtIso: this.nowIso(),
    });

    const resumedCheckpoint = this.checkpointManager.resolve({
      userId: params.userId,
      requestId: params.requestId,
      reviewerUserId: params.reviewerUserId,
      decision: params.decision,
      rejectionReason: params.rejectionReason,
      editedAction: params.decision === 'edit' ? editedAction : undefined,
      resumedExecutionId: execution.id,
      nowIso: this.nowIso(),
    });

    this.changeHistory.append({
      userId: params.userId,
      workflowId: request.workflowId,
      changeType: 'checkpoint_resumed',
      summary: `Checkpoint ${request.id} resumed workflow execution ${execution.id}.`,
      metadata: {
        requestId: request.id,
        executionId: execution.id,
        decision: params.decision,
      },
      createdAtIso: this.nowIso(),
    });

    emitActivityEvent({
      userId: params.userId,
      category: 'workflow',
      eventType: 'workflow.checkpoint_resumed',
      title: 'Checkpoint resumed',
      description: `Checkpoint ${request.id} resumed execution ${execution.id}.`,
      metadata: {
        workflowId: request.workflowId,
        requestId: request.id,
        executionId: execution.id,
      },
    });

    return {
      checkpoint: resumedCheckpoint,
      execution,
    };
  }

  commitBackgroundExecution(params: {
    userId: string;
    workflowId: string;
    triggerType: WorkflowTriggerType;
    startedAtIso: string;
    finishedAtIso: string;
    stepResults: StepResult[];
    failedMessage?: string;
  }): WorkflowExecution {
    const workflow = this.store.getWorkflow(params.userId, params.workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${params.workflowId} not found.`);
    }

    const finalResult = params.stepResults[params.stepResults.length - 1];
    const status = params.failedMessage
      ? 'failed'
      : finalResult
        ? statusFromStep(finalResult)
        : 'failed';

    const normalizedResults =
      params.failedMessage && params.stepResults.length === 0
        ? [
            {
              id: makeId('step-result'),
              workflowId: workflow.id,
              stepId: 'worker-failure',
              status: 'failed',
              startedAtIso: params.startedAtIso,
              finishedAtIso: params.finishedAtIso,
              durationMs: Math.max(0, Date.parse(params.finishedAtIso) - Date.parse(params.startedAtIso)),
              outputSummary: params.failedMessage,
              outputPayload: {},
              errorMessage: params.failedMessage,
            } satisfies StepResult,
          ]
        : params.stepResults;

    return this.commitExecution({
      userId: params.userId,
      workflow,
      triggerType: params.triggerType,
      stepResults: normalizedResults,
      status,
      startedAtIso: params.startedAtIso,
      finishedAtIso: params.finishedAtIso,
    });
  }

  listPendingApprovals(): ApprovalRequest[] {
    return policyEngine.queue.list('pending');
  }

  resolveApproval(params: {
    requestId: string;
    reviewerUserId: string;
    approve: boolean;
  }): PolicyEvaluationResult {
    return policyEngine.resolveApproval({
      requestId: params.requestId,
      reviewerUserId: params.reviewerUserId,
      approve: params.approve,
      decidedAtIso: this.nowIso(),
    });
  }

  private buildPolicyViolationStepResult(payload: {
    workflow: Workflow;
    step: Workflow['steps'][number];
    message: string;
  }): StepResult {
    const nowIso = this.nowIso();
    return {
      id: makeId('step-result'),
      workflowId: payload.workflow.id,
      stepId: payload.step.id,
      status: 'failed',
      startedAtIso: nowIso,
      finishedAtIso: nowIso,
      durationMs: 0,
      outputSummary: `Workflow policy violation: ${payload.message}`,
      outputPayload: {
        policyReason: payload.message,
      },
      errorMessage: payload.message,
    };
  }

  private maybeCreateCheckpointRequest(payload: {
    userId: string;
    workflow: Workflow;
    execution: WorkflowExecution;
  }): void {
    const lastResult = payload.execution.stepResults[payload.execution.stepResults.length - 1];
    if (!lastResult || lastResult.status !== 'checkpoint_required') return;

    const existing = this.checkpointManager
      .list(payload.userId, 'pending')
      .find((request) => request.executionId === payload.execution.id && request.checkpointStepId === lastResult.stepId);
    if (existing) return;

    const checkpointPayload = isRecord(lastResult.outputPayload.checkpoint)
      ? lastResult.outputPayload.checkpoint
      : null;

    const stepIndex = payload.workflow.steps.findIndex((step) => step.id === lastResult.stepId);
    const remainingStepIds =
      stepIndex >= 0 ? payload.workflow.steps.slice(stepIndex + 1).map((step) => step.id) : [];

    const proposedActionPayload = checkpointPayload && isRecord(checkpointPayload.proposedAction)
      ? checkpointPayload.proposedAction
      : null;

    const proposedAction: CheckpointProposedAction | undefined = proposedActionPayload
      ? {
          title: String(proposedActionPayload.title ?? 'Review next action'),
          description: String(proposedActionPayload.description ?? 'No description provided.'),
          actionId: String(proposedActionPayload.actionId ?? 'workflow.unknown'),
          inputTemplate:
            typeof proposedActionPayload.inputTemplate === 'string'
              ? proposedActionPayload.inputTemplate
              : undefined,
        }
      : undefined;

    const riskLevel =
      checkpointPayload && typeof checkpointPayload.riskLevel === 'string'
        ? checkpointPayload.riskLevel
        : undefined;

    const riskSummary =
      checkpointPayload && typeof checkpointPayload.riskSummary === 'string'
        ? checkpointPayload.riskSummary
        : undefined;

    this.checkpointManager.create({
      userId: payload.userId,
      workflow: payload.workflow,
      executionId: payload.execution.id,
      checkpointStepId: lastResult.stepId,
      previousStepResults: [...payload.execution.stepResults],
      remainingStepIds,
      proposedAction,
      riskLevel:
        riskLevel === 'high' || riskLevel === 'medium' || riskLevel === 'low' ? riskLevel : undefined,
      riskSummary,
      nowIso: payload.execution.finishedAtIso,
    });
  }

  private commitExecution(params: {
    userId: string;
    workflow: Workflow;
    triggerType: WorkflowTriggerType;
    stepResults: StepResult[];
    status: WorkflowExecutionStatus;
    startedAtIso: string;
    finishedAtIso: string;
  }): WorkflowExecution {
    const memoryNamespace = this.memoryScope.namespaceFor(params.workflow.id);
    for (const result of params.stepResults) {
      this.memoryScope.append(memoryNamespace, result.stepId, result.outputPayload, params.finishedAtIso);
    }

    const execution: WorkflowExecution = {
      id: makeId('execution'),
      workflowId: params.workflow.id,
      userId: params.userId,
      status: params.status,
      triggerType: params.triggerType,
      startedAtIso: params.startedAtIso,
      finishedAtIso: params.finishedAtIso,
      durationMs: Math.max(0, Date.parse(params.finishedAtIso) - Date.parse(params.startedAtIso)),
      heartbeatAtIso: params.finishedAtIso,
      stepResults: params.stepResults,
      memoryNamespace,
    };

    const artifact = this.store.appendArtifact(params.userId, {
      id: makeId('artifact'),
      userId: params.userId,
      workflowId: params.workflow.id,
      executionId: execution.id,
      title: `${params.workflow.name} • ${params.status}`,
      body: artifactBodyFromResults(params.stepResults),
      status: params.status,
      createdAtIso: params.finishedAtIso,
    });
    execution.inboxArtifactId = artifact.id;

    this.store.appendExecution(params.userId, execution);

    const statusByStep = new Map(params.stepResults.map((result) => [result.stepId, result.status]));
    const workflowForSave = withWorkflowPolicy(
      {
        ...params.workflow,
        updatedAtIso: params.finishedAtIso,
        lastExecutionId: execution.id,
        trigger: advanceScheduleTrigger(params.workflow, params.triggerType, params.finishedAtIso),
        steps: params.workflow.steps.map((step) => ({
          ...step,
          status: statusByStep.get(step.id) ?? 'idle',
        })),
      },
      params.finishedAtIso
    );

    this.store.upsertWorkflow(params.userId, workflowForSave);

    if (artifact.body.trim().length > 0) {
      try {
        const ingestion = ingestKnowledgeNote({
          userId: params.userId,
          title: `Workflow output: ${params.workflow.name}`,
          text: artifact.body,
          nowIso: params.finishedAtIso,
          tags: [
            'workflow_output',
            `workflow:${params.workflow.id}`,
            `execution:${execution.id}`,
          ],
        });

        emitActivityEvent({
          userId: params.userId,
          category: 'knowledge',
          eventType: 'knowledge.workflow_output_ingested',
          title: 'Workflow output ingested',
          description: `Workflow output added to knowledge graph as ${ingestion.source.id}.`,
          metadata: {
            workflowId: params.workflow.id,
            executionId: execution.id,
            sourceId: ingestion.source.id,
          },
        });
      } catch (error) {
        emitActivityEvent({
          userId: params.userId,
          category: 'workflow',
          eventType: 'workflow.knowledge_ingest_failed',
          title: 'Workflow knowledge ingestion failed',
          description:
            error instanceof Error
              ? error.message
              : 'Unable to ingest workflow output into knowledge graph.',
          metadata: {
            workflowId: params.workflow.id,
            executionId: execution.id,
          },
        });
      }
    }

    if (execution.status === 'checkpoint_required') {
      this.maybeCreateCheckpointRequest({
        userId: params.userId,
        workflow: workflowForSave,
        execution,
      });
    }

    emitActivityEvent({
      userId: params.userId,
      category: 'workflow',
      eventType: statusToEventType(execution.status),
      title: `Workflow ${statusDescription(execution.status)}`,
      description: `${params.workflow.name} ${statusDescription(execution.status)} after ${execution.stepResults.length} step(s).`,
      metadata: {
        workflowId: params.workflow.id,
        executionId: execution.id,
        triggerType: params.triggerType,
        status: execution.status,
      },
    });

    publishWorkflowNotification(params.userId, execution, this.store);
    return execution;
  }
}

export const workflowEngine = new WorkflowEngine();
