import type {
  Workflow,
  WorkflowPolicy,
  WorkflowPolicyActionType,
  WorkflowStep,
} from './types';

const CONNECTOR_MUTATION_HINTS = [
  'create_',
  'update_',
  'delete_',
  'append_',
  'send_',
  'write_',
  'set_',
];

const clampAtLeast = (value: number, minimum: number): number => {
  if (!Number.isFinite(value)) return minimum;
  return Math.max(minimum, Math.floor(value));
};

const makePolicyId = (workflowId: string): string => `wf-policy-${workflowId}`;

const parseConnectorId = (actionId: string): string | null => {
  const parts = actionId.split('.');
  if (parts.length < 3 || parts[0] !== 'connector') return null;
  return parts[1];
};

const parseConnectorAction = (actionId: string): string => {
  const parts = actionId.split('.');
  if (parts.length < 3 || parts[0] !== 'connector') return '';
  return parts.slice(2).join('.').toLowerCase();
};

const inferActionType = (step: WorkflowStep): WorkflowPolicyActionType => {
  if (step.kind === 'transform') return 'transform';
  if (step.kind === 'artifact') return 'artifact';
  if (step.kind === 'checkpoint') return 'checkpoint';

  const connectorAction = parseConnectorAction(step.actionId);
  const isMutation = CONNECTOR_MUTATION_HINTS.some((hint) => connectorAction.includes(hint));
  return isMutation ? 'connector_mutation' : 'connector_read';
};

const estimateTokenCost = (step: WorkflowStep, actionType: WorkflowPolicyActionType): number => {
  const payloadLength = step.inputTemplate?.length ?? 0;
  const payloadCost = clampAtLeast(Math.ceil(payloadLength / 12), 0);

  if (actionType === 'connector_read') return 300 + payloadCost;
  if (actionType === 'connector_mutation') return 450 + payloadCost;
  if (actionType === 'transform') return 700 + payloadCost;
  if (actionType === 'artifact') return 220 + payloadCost;
  return 80 + payloadCost;
};

export interface WorkflowPolicyUsage {
  totalStepsExecuted: number;
  connectorCalls: number;
  mutationCalls: number;
  transformCalls: number;
  artifactWrites: number;
  estimatedTokens: number;
}

export interface WorkflowPolicyStepDecision {
  allowed: boolean;
  code:
    | 'allowed'
    | 'action_type_blocked'
    | 'connector_blocked'
    | 'connector_not_allowed'
    | 'budget_exceeded';
  message: string;
  actionType: WorkflowPolicyActionType;
  connectorId: string | null;
  projectedUsage: WorkflowPolicyUsage;
}

export const createEmptyWorkflowPolicyUsage = (): WorkflowPolicyUsage => ({
  totalStepsExecuted: 0,
  connectorCalls: 0,
  mutationCalls: 0,
  transformCalls: 0,
  artifactWrites: 0,
  estimatedTokens: 0,
});

export const accumulateWorkflowPolicyUsage = (
  usage: WorkflowPolicyUsage,
  step: WorkflowStep
): WorkflowPolicyUsage => {
  const actionType = inferActionType(step);
  return {
    totalStepsExecuted: usage.totalStepsExecuted + 1,
    connectorCalls:
      usage.connectorCalls +
      (actionType === 'connector_read' || actionType === 'connector_mutation' ? 1 : 0),
    mutationCalls: usage.mutationCalls + (actionType === 'connector_mutation' ? 1 : 0),
    transformCalls: usage.transformCalls + (actionType === 'transform' ? 1 : 0),
    artifactWrites: usage.artifactWrites + (actionType === 'artifact' ? 1 : 0),
    estimatedTokens: usage.estimatedTokens + estimateTokenCost(step, actionType),
  };
};

const hasExceededBudget = (
  usage: WorkflowPolicyUsage,
  policy: WorkflowPolicy
): { exceeded: boolean; reason: string } => {
  const budget = policy.budget;
  if (!budget) return { exceeded: false, reason: '' };

  if (
    typeof budget.maxTotalSteps === 'number' &&
    usage.totalStepsExecuted > clampAtLeast(budget.maxTotalSteps, 1)
  ) {
    return { exceeded: true, reason: `maxTotalSteps=${budget.maxTotalSteps}` };
  }

  if (
    typeof budget.maxConnectorCalls === 'number' &&
    usage.connectorCalls > clampAtLeast(budget.maxConnectorCalls, 0)
  ) {
    return { exceeded: true, reason: `maxConnectorCalls=${budget.maxConnectorCalls}` };
  }

  if (
    typeof budget.maxMutationCalls === 'number' &&
    usage.mutationCalls > clampAtLeast(budget.maxMutationCalls, 0)
  ) {
    return { exceeded: true, reason: `maxMutationCalls=${budget.maxMutationCalls}` };
  }

  if (
    typeof budget.maxTransformCalls === 'number' &&
    usage.transformCalls > clampAtLeast(budget.maxTransformCalls, 0)
  ) {
    return { exceeded: true, reason: `maxTransformCalls=${budget.maxTransformCalls}` };
  }

  if (
    typeof budget.maxArtifactWrites === 'number' &&
    usage.artifactWrites > clampAtLeast(budget.maxArtifactWrites, 0)
  ) {
    return { exceeded: true, reason: `maxArtifactWrites=${budget.maxArtifactWrites}` };
  }

  if (
    typeof budget.maxEstimatedTokens === 'number' &&
    usage.estimatedTokens > clampAtLeast(budget.maxEstimatedTokens, 1)
  ) {
    return { exceeded: true, reason: `maxEstimatedTokens=${budget.maxEstimatedTokens}` };
  }

  return { exceeded: false, reason: '' };
};

export const evaluateWorkflowStepPolicy = (payload: {
  policy: WorkflowPolicy;
  usage: WorkflowPolicyUsage;
  step: WorkflowStep;
}): WorkflowPolicyStepDecision => {
  const actionType = inferActionType(payload.step);
  const connectorId = parseConnectorId(payload.step.actionId);
  const projectedUsage = accumulateWorkflowPolicyUsage(payload.usage, payload.step);

  if (
    payload.policy.allowedActionTypes &&
    payload.policy.allowedActionTypes.length > 0 &&
    !payload.policy.allowedActionTypes.includes(actionType)
  ) {
    return {
      allowed: false,
      code: 'action_type_blocked',
      message: `Workflow policy blocks action type "${actionType}".`,
      actionType,
      connectorId,
      projectedUsage,
    };
  }

  if (connectorId) {
    const blocked = new Set(payload.policy.blockedConnectorIds ?? []);
    const allowed = payload.policy.allowedConnectorIds
      ? new Set(payload.policy.allowedConnectorIds)
      : null;

    if (blocked.has(connectorId)) {
      return {
        allowed: false,
        code: 'connector_blocked',
        message: `Workflow policy blocks connector "${connectorId}".`,
        actionType,
        connectorId,
        projectedUsage,
      };
    }

    if (allowed && !allowed.has(connectorId)) {
      return {
        allowed: false,
        code: 'connector_not_allowed',
        message: `Workflow policy allows only specific connectors; "${connectorId}" is not allowed.`,
        actionType,
        connectorId,
        projectedUsage,
      };
    }
  }

  const budget = hasExceededBudget(projectedUsage, payload.policy);
  if (budget.exceeded) {
    return {
      allowed: false,
      code: 'budget_exceeded',
      message: `Workflow policy budget exceeded (${budget.reason}).`,
      actionType,
      connectorId,
      projectedUsage,
    };
  }

  return {
    allowed: true,
    code: 'allowed',
    message: 'Workflow policy allows this step.',
    actionType,
    connectorId,
    projectedUsage,
  };
};

const deriveAllowedConnectors = (workflow: Workflow): string[] => {
  const connectorIds = workflow.steps
    .map((step) => parseConnectorId(step.actionId))
    .filter((connectorId): connectorId is string => Boolean(connectorId));
  return [...new Set(connectorIds)];
};

export const buildDefaultWorkflowPolicy = (
  workflow: Workflow,
  nowIso: string = new Date().toISOString()
): WorkflowPolicy => {
  const stepCount = Math.max(workflow.steps.length, 1);
  const connectorCount = deriveAllowedConnectors(workflow).length;
  const allowedConnectorIds = deriveAllowedConnectors(workflow);

  return {
    id: makePolicyId(workflow.id),
    workflowId: workflow.id,
    allowedConnectorIds,
    blockedConnectorIds: [],
    allowedActionTypes: [
      'connector_read',
      'connector_mutation',
      'transform',
      'artifact',
      'checkpoint',
    ],
    budget: {
      maxTotalSteps: Math.max(6, stepCount * 3),
      maxConnectorCalls: Math.max(4, connectorCount * 2),
      maxMutationCalls: 3,
      maxTransformCalls: Math.max(4, stepCount * 2),
      maxArtifactWrites: Math.max(2, stepCount),
      maxEstimatedTokens: Math.max(5000, stepCount * 1400),
      maxRuntimeMs: 120_000,
    },
    requireApprovalForMutations: true,
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };
};

export const ensureWorkflowPolicy = (
  workflow: Workflow,
  nowIso: string = new Date().toISOString()
): WorkflowPolicy => {
  if (!workflow.policy) {
    return buildDefaultWorkflowPolicy(workflow, nowIso);
  }

  return {
    ...workflow.policy,
    id: workflow.policy.id || makePolicyId(workflow.id),
    workflowId: workflow.id,
    createdAtIso: workflow.policy.createdAtIso || nowIso,
    updatedAtIso: nowIso,
  };
};

export const withWorkflowPolicy = (
  workflow: Workflow,
  nowIso: string = new Date().toISOString()
): Workflow => ({
  ...workflow,
  policy: ensureWorkflowPolicy(workflow, nowIso),
});
