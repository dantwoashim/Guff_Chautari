import { connectorRegistry, ConnectorRegistry } from '../connectors';
import { retrieveKnowledge } from '../knowledge';
import type { StepResult, Workflow, WorkflowStep } from './types';

interface ExecuteWorkflowStepInput {
  userId: string;
  workflow: Workflow;
  step: WorkflowStep;
  previousResults: ReadonlyArray<StepResult>;
  registry?: ConnectorRegistry;
  nowIso?: string;
}

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

const parseTemplate = (template: string | undefined): Record<string, unknown> => {
  if (!template) return {};
  try {
    const parsed = JSON.parse(template);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
};

const stringify = (value: unknown): string => {
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
};

const summarizeFromPrevious = (previousResults: ReadonlyArray<StepResult>): string => {
  if (previousResults.length === 0) return 'No prior outputs available.';
  const lines: string[] = [];

  for (const result of previousResults.slice(-3)) {
    const summary = result.outputSummary.trim();
    if (summary.length > 0) {
      lines.push(`- ${summary}`);
    }
  }

  if (lines.length === 0) return 'No summarized output available from previous steps.';
  return lines.join('\n');
};

const executeTransformStep = (
  step: WorkflowStep,
  previousResults: ReadonlyArray<StepResult>,
  workflow: Workflow,
  userId: string,
  inputPayload: Record<string, unknown>
): { status: StepResult['status']; outputSummary: string; outputPayload: Record<string, unknown> } => {
  if (step.actionId === 'transform.collect_context') {
    const query =
      typeof inputPayload.query === 'string' && inputPayload.query.trim().length > 0
        ? inputPayload.query.trim()
        : workflow.naturalLanguagePrompt;
    const topKRaw = Number(inputPayload.topK ?? 4);
    const topK = Number.isFinite(topKRaw) ? Math.max(1, Math.min(topKRaw, 12)) : 4;
    const retrieval = retrieveKnowledge({
      userId,
      query,
      topK,
    });

    const knowledgeHits = retrieval.hits.map((hit) => ({
      sourceId: hit.source.id,
      sourceTitle: hit.source.title,
      nodeId: hit.node.id,
      score: hit.score,
      snippet: hit.node.text.slice(0, 180),
    }));

    const snapshot = previousResults.map((result) => ({
      stepId: result.stepId,
      summary: result.outputSummary,
      status: result.status,
    }));

    return {
      status: 'completed',
      outputSummary:
        knowledgeHits.length > 0
          ? `Collected workflow context with ${knowledgeHits.length} knowledge hit(s).`
          : 'Collected workflow context snapshot (no matching knowledge hits).',
      outputPayload: {
        workflowPrompt: workflow.naturalLanguagePrompt,
        knowledgeQuery: query,
        knowledgeHits,
        retrievalFormula: retrieval.formula,
        snapshot,
      },
    };
  }

  if (step.actionId === 'transform.summarize') {
    const summary = summarizeFromPrevious(previousResults);
    return {
      status: 'completed',
      outputSummary: `Generated synthesis from ${previousResults.length} prior step(s).`,
      outputPayload: {
        summary,
        sourceStepIds: previousResults.map((result) => result.stepId),
      },
    };
  }

  return {
    status: 'failed',
    outputSummary: `Unsupported transform action: ${step.actionId}`,
    outputPayload: {},
  };
};

const executeArtifactStep = (
  step: WorkflowStep,
  previousResults: ReadonlyArray<StepResult>,
  workflow: Workflow
): { status: StepResult['status']; outputSummary: string; outputPayload: Record<string, unknown> } => {
  if (step.actionId !== 'artifact.publish') {
    return {
      status: 'failed',
      outputSummary: `Unsupported artifact action: ${step.actionId}`,
      outputPayload: {},
    };
  }

  const last = previousResults[previousResults.length - 1];
  const body =
    (last?.outputPayload.summary ? String(last.outputPayload.summary) : last?.outputSummary) ||
    'No generated output.';

  return {
    status: 'completed',
    outputSummary: 'Published workflow artifact.',
    outputPayload: {
      artifactTitle: `${workflow.name} Output`,
      artifactBody: body,
      fromStepId: last?.stepId ?? null,
    },
  };
};

const executeCheckpointStep = (
  step: WorkflowStep,
  previousResults: ReadonlyArray<StepResult>,
  workflow: Workflow
): { status: StepResult['status']; outputSummary: string; outputPayload: Record<string, unknown> } => {
  const stepIndex = workflow.steps.findIndex((candidate) => candidate.id === step.id);
  const nextStep = stepIndex >= 0 ? workflow.steps[stepIndex + 1] : null;
  const remainingStepIds =
    stepIndex >= 0 ? workflow.steps.slice(stepIndex + 1).map((candidate) => candidate.id) : [];

  const connectorCount = previousResults.filter((result) =>
    String(result.outputPayload.actionId ?? '').startsWith('connector.')
  ).length;
  const riskLevel = connectorCount >= 2 || remainingStepIds.length >= 3 ? 'medium' : 'low';
  const riskSummary =
    riskLevel === 'medium'
      ? 'Checkpoint reached with multiple connector operations pending. Review before continuing.'
      : 'Checkpoint reached. Manual confirmation required before continuing.';

  const proposedAction = nextStep
    ? {
        title: nextStep.title,
        description: nextStep.description,
        actionId: nextStep.actionId,
        inputTemplate: nextStep.inputTemplate,
      }
    : {
        title: 'Complete workflow',
        description: 'No remaining steps after this checkpoint.',
        actionId: 'workflow.complete',
      };

  return {
    status: 'checkpoint_required',
    outputSummary: nextStep
      ? `Checkpoint requires review before running "${nextStep.title}".`
      : 'Checkpoint requires review before marking workflow complete.',
    outputPayload: {
      checkpoint: {
        riskLevel,
        riskSummary,
        proposedAction,
        remainingStepIds,
      },
    },
  };
};

const parseConnectorActionId = (actionId: string): { connectorId: string; connectorActionId: string } => {
  const parts = actionId.split('.');
  if (parts.length < 3 || parts[0] !== 'connector') {
    throw new Error(`Invalid connector action id: ${actionId}`);
  }
  return {
    connectorId: parts[1],
    connectorActionId: parts.slice(2).join('.'),
  };
};

export const executeWorkflowStep = async (input: ExecuteWorkflowStepInput): Promise<StepResult> => {
  const registry = input.registry ?? connectorRegistry;
  const startedAtIso = input.nowIso ?? new Date().toISOString();
  const startedAtMs = Date.parse(startedAtIso);
  const templatePayload = parseTemplate(input.step.inputTemplate);

  let status: StepResult['status'] = 'completed';
  let outputSummary = '';
  let outputPayload: Record<string, unknown> = {};
  let errorMessage: string | undefined;
  let policyDecision: StepResult['policyDecision'];
  let approvalRequest: StepResult['approvalRequest'];

  try {
    if (input.step.kind === 'connector') {
      const parsed = parseConnectorActionId(input.step.actionId);
      const outcome = await registry.invoke({
        userId: input.userId,
        connectorId: parsed.connectorId,
        actionId: parsed.connectorActionId,
        payload: templatePayload,
        actorRole: 'owner',
      });

      policyDecision = outcome.policyDecision;
      approvalRequest = outcome.approvalRequest;

      if (outcome.policyDecision.decision !== 'allow') {
        status = outcome.policyDecision.decision === 'escalate' ? 'approval_required' : 'failed';
        outputSummary = `Connector action blocked by policy: ${outcome.policyDecision.reason}`;
        outputPayload = {
          policyReason: outcome.policyDecision.reason,
        };
      } else if (!outcome.result?.ok) {
        status = 'failed';
        outputSummary = outcome.result?.summary || 'Connector execution failed.';
        outputPayload = {
          connectorResult: outcome.result ?? null,
        };
        errorMessage = outcome.result?.errorMessage ?? 'Connector execution failed.';
      } else {
        status = 'completed';
        outputSummary = outcome.result.summary;
        outputPayload = {
          connectorId: parsed.connectorId,
          actionId: parsed.connectorActionId,
          data: outcome.result.data ?? {},
        };
      }
    } else if (input.step.kind === 'transform') {
      const transform = executeTransformStep(
        input.step,
        input.previousResults,
        input.workflow,
        input.userId,
        templatePayload
      );
      status = transform.status;
      outputSummary = transform.outputSummary;
      outputPayload = transform.outputPayload;
      if (status === 'failed') errorMessage = outputSummary;
    } else if (input.step.kind === 'artifact') {
      const artifact = executeArtifactStep(input.step, input.previousResults, input.workflow);
      status = artifact.status;
      outputSummary = artifact.outputSummary;
      outputPayload = artifact.outputPayload;
      if (status === 'failed') errorMessage = outputSummary;
    } else {
      const checkpoint = executeCheckpointStep(input.step, input.previousResults, input.workflow);
      status = checkpoint.status;
      outputSummary = checkpoint.outputSummary;
      outputPayload = checkpoint.outputPayload;
    }
  } catch (error) {
    status = 'failed';
    errorMessage = error instanceof Error ? error.message : stringify(error);
    outputSummary = `Step failed: ${errorMessage}`;
    outputPayload = {};
  }

  const finishedAtIso = new Date(
    Math.max(Date.now(), Number.isFinite(startedAtMs) ? startedAtMs : Date.now())
  ).toISOString();
  const durationMs = Math.max(0, Date.parse(finishedAtIso) - startedAtMs);

  return {
    id: makeId('step-result'),
    workflowId: input.workflow.id,
    stepId: input.step.id,
    status,
    startedAtIso,
    finishedAtIso,
    durationMs,
    outputSummary,
    outputPayload,
    errorMessage,
    policyDecision,
    approvalRequest,
  };
};
