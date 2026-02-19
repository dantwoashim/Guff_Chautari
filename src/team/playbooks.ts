import {
  WorkflowEngine,
  workflowEngine as defaultWorkflowEngine,
  type Workflow,
  type WorkflowExecution,
  type WorkflowStep,
  type WorkflowTrigger,
} from '../workflows';
import { assertWorkspacePermission, type WorkspacePermission } from './permissions';
import { workspaceManager } from './workspaceManager';
import type { WorkspaceRole } from './types';

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

const renderTemplateString = (template: string, params: Record<string, string>): string =>
  template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => params[key] ?? '');

export type TeamPlaybookCategory = 'operations' | 'engineering' | 'sales' | 'hr' | 'research';
export type TeamPlaybookStatus = 'active' | 'archived';
export type PlaybookParameterInputType = 'text' | 'textarea' | 'number' | 'select' | 'date';

export interface TeamPlaybookParameterOption {
  label: string;
  value: string;
}

export interface TeamPlaybookParameterDefinition {
  key: string;
  label: string;
  description?: string;
  required?: boolean;
  inputType?: PlaybookParameterInputType;
  defaultValue?: string;
  options?: TeamPlaybookParameterOption[];
}

export interface TeamPlaybookStepTemplate {
  title: string;
  description: string;
  kind: WorkflowStep['kind'];
  actionId: string;
  inputTemplate?: string;
}

export interface TeamPlaybookTemplate {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  category: TeamPlaybookCategory;
  status: TeamPlaybookStatus;
  naturalLanguagePromptTemplate: string;
  triggerTemplate?: Partial<WorkflowTrigger>;
  stepTemplates: TeamPlaybookStepTemplate[];
  parameters: TeamPlaybookParameterDefinition[];
  sourceRunbookId?: string;
  createdByUserId: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface TeamPlaybookExecutionRecord {
  executionId: string;
  status: WorkflowExecution['status'];
  startedAtIso: string;
  finishedAtIso: string;
  durationMs: number;
}

export interface TeamPlaybookInstance {
  id: string;
  workspaceId: string;
  playbookId: string;
  playbookName: string;
  workflowId: string;
  workflowUserId: string;
  createdByUserId: string;
  parameterValues: Record<string, string>;
  lastExecutionStatus?: WorkflowExecution['status'];
  executionHistory: TeamPlaybookExecutionRecord[];
  createdAtIso: string;
  updatedAtIso: string;
}

export interface TeamPlaybookInstantiationResult {
  playbook: TeamPlaybookTemplate;
  workflow: Workflow;
  instance: TeamPlaybookInstance;
  execution?: WorkflowExecution;
}

interface TeamPlaybookManagerOptions {
  workflowEngine?: WorkflowEngine;
  nowIso?: () => string;
  resolveMemberRole?: (payload: { workspaceId: string; userId: string }) => WorkspaceRole | null;
  resolveWorkspaceOwnerUserId?: (workspaceId: string) => string | null;
}

const normalizeTrigger = (triggerTemplate: Partial<WorkflowTrigger> | undefined, nowIso: string): WorkflowTrigger => {
  if (!triggerTemplate?.type) {
    return {
      id: makeId('trigger'),
      type: 'manual',
      enabled: true,
    };
  }

  if (triggerTemplate.type === 'schedule') {
    const nextRunAtIso =
      triggerTemplate.schedule?.nextRunAtIso ??
      new Date(Date.parse(nowIso) + 24 * 60 * 60 * 1000).toISOString();
    return {
      id: makeId('trigger'),
      type: 'schedule',
      enabled: triggerTemplate.enabled ?? true,
      schedule: {
        intervalMinutes: Math.max(1, triggerTemplate.schedule?.intervalMinutes ?? 24 * 60),
        nextRunAtIso,
        cronLike: triggerTemplate.schedule?.cronLike ?? 'DAILY@09:00',
      },
    };
  }

  if (triggerTemplate.type === 'event') {
    return {
      id: makeId('trigger'),
      type: 'event',
      enabled: triggerTemplate.enabled ?? true,
      event: {
        eventType: triggerTemplate.event?.eventType ?? 'new_message',
        keyword: triggerTemplate.event?.keyword,
      },
    };
  }

  return {
    id: makeId('trigger'),
    type: 'manual',
    enabled: triggerTemplate.enabled ?? true,
  };
};

const buildWorkflowSteps = (
  templates: ReadonlyArray<TeamPlaybookStepTemplate>,
  params: Record<string, string>
): WorkflowStep[] =>
  templates.map((template) => ({
    id: makeId('step'),
    title: renderTemplateString(template.title, params),
    description: renderTemplateString(template.description, params),
    kind: template.kind,
    actionId: template.actionId,
    inputTemplate: template.inputTemplate
      ? renderTemplateString(template.inputTemplate, params)
      : undefined,
    status: 'idle',
  }));

const resolveParameterValues = (
  definitions: ReadonlyArray<TeamPlaybookParameterDefinition>,
  provided: Record<string, string> | undefined
): Record<string, string> => {
  const values = provided ?? {};
  const resolved: Record<string, string> = {};

  for (const definition of definitions) {
    const candidate = values[definition.key] ?? definition.defaultValue ?? '';
    if (definition.required && candidate.trim().length === 0) {
      throw new Error(`Playbook parameter "${definition.label}" is required.`);
    }
    if (definition.options && definition.options.length > 0) {
      const isValid = definition.options.some((option) => option.value === candidate);
      if (candidate.trim().length > 0 && !isValid) {
        throw new Error(`Invalid value for "${definition.label}".`);
      }
    }
    resolved[definition.key] = candidate;
  }

  return resolved;
};

const byUpdatedAtDesc = <T extends { updatedAtIso: string }>(items: ReadonlyArray<T>): T[] =>
  [...items].sort((left, right) => Date.parse(right.updatedAtIso) - Date.parse(left.updatedAtIso));

const byCreatedAtDesc = <T extends { createdAtIso: string }>(items: ReadonlyArray<T>): T[] =>
  [...items].sort((left, right) => Date.parse(right.createdAtIso) - Date.parse(left.createdAtIso));

export class TeamPlaybookManager {
  private readonly workflowEngine: WorkflowEngine;
  private readonly nowIso: () => string;
  private readonly resolveMemberRole: (payload: { workspaceId: string; userId: string }) => WorkspaceRole | null;
  private readonly resolveWorkspaceOwnerUserId: (workspaceId: string) => string | null;
  private readonly playbooksByWorkspaceId = new Map<string, TeamPlaybookTemplate[]>();
  private readonly instancesByWorkspaceId = new Map<string, TeamPlaybookInstance[]>();

  constructor(options: TeamPlaybookManagerOptions = {}) {
    this.workflowEngine = options.workflowEngine ?? defaultWorkflowEngine;
    this.nowIso = options.nowIso ?? (() => new Date().toISOString());
    this.resolveMemberRole =
      options.resolveMemberRole ??
      ((payload) => workspaceManager.getMemberRole(payload.workspaceId, payload.userId));
    this.resolveWorkspaceOwnerUserId =
      options.resolveWorkspaceOwnerUserId ??
      ((workspaceId) => workspaceManager.getWorkspace(workspaceId)?.createdByUserId ?? null);
  }

  listPlaybooks(payload: { workspaceId: string; actorUserId: string }): TeamPlaybookTemplate[] {
    this.requirePermission({
      workspaceId: payload.workspaceId,
      actorUserId: payload.actorUserId,
      action: 'workspace.workflows.read',
    });

    return byUpdatedAtDesc(this.playbooksByWorkspaceId.get(payload.workspaceId) ?? []);
  }

  getPlaybook(payload: {
    workspaceId: string;
    actorUserId: string;
    playbookId: string;
  }): TeamPlaybookTemplate | null {
    return (
      this.listPlaybooks({
        workspaceId: payload.workspaceId,
        actorUserId: payload.actorUserId,
      }).find((playbook) => playbook.id === payload.playbookId) ?? null
    );
  }

  findPlaybookBySourceRunbookId(payload: {
    workspaceId: string;
    actorUserId: string;
    sourceRunbookId: string;
  }): TeamPlaybookTemplate | null {
    return (
      this.listPlaybooks({
        workspaceId: payload.workspaceId,
        actorUserId: payload.actorUserId,
      }).find((playbook) => playbook.sourceRunbookId === payload.sourceRunbookId) ?? null
    );
  }

  createPlaybook(payload: {
    workspaceId: string;
    createdByUserId: string;
    name: string;
    description: string;
    category: TeamPlaybookCategory;
    naturalLanguagePromptTemplate: string;
    stepTemplates: TeamPlaybookStepTemplate[];
    parameters?: TeamPlaybookParameterDefinition[];
    triggerTemplate?: Partial<WorkflowTrigger>;
    sourceRunbookId?: string;
    status?: TeamPlaybookStatus;
  }): TeamPlaybookTemplate {
    this.requirePermission({
      workspaceId: payload.workspaceId,
      actorUserId: payload.createdByUserId,
      action: 'workspace.workflows.write',
    });
    if (payload.stepTemplates.length === 0) {
      throw new Error('Playbook must include at least one step template.');
    }

    const nowIso = this.nowIso();
    const playbook: TeamPlaybookTemplate = {
      id: makeId('team-playbook'),
      workspaceId: payload.workspaceId,
      name: payload.name.trim() || 'Untitled Playbook',
      description: payload.description.trim() || 'Reusable team workflow playbook.',
      category: payload.category,
      status: payload.status ?? 'active',
      naturalLanguagePromptTemplate:
        payload.naturalLanguagePromptTemplate.trim() || payload.description.trim() || payload.name,
      stepTemplates: [...payload.stepTemplates],
      parameters: [...(payload.parameters ?? [])],
      triggerTemplate: payload.triggerTemplate,
      sourceRunbookId: payload.sourceRunbookId,
      createdByUserId: payload.createdByUserId,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };

    const current = this.playbooksByWorkspaceId.get(payload.workspaceId) ?? [];
    this.playbooksByWorkspaceId.set(payload.workspaceId, [playbook, ...current]);
    return playbook;
  }

  listPlaybookInstances(payload: {
    workspaceId: string;
    actorUserId: string;
    playbookId?: string;
  }): TeamPlaybookInstance[] {
    this.requirePermission({
      workspaceId: payload.workspaceId,
      actorUserId: payload.actorUserId,
      action: 'workspace.workflows.read',
    });

    const all = this.instancesByWorkspaceId.get(payload.workspaceId) ?? [];
    const filtered = payload.playbookId
      ? all.filter((instance) => instance.playbookId === payload.playbookId)
      : all;
    return byUpdatedAtDesc(filtered);
  }

  async instantiatePlaybook(payload: {
    workspaceId: string;
    playbookId: string;
    actorUserId: string;
    parameterValues?: Record<string, string>;
    runNow?: boolean;
    workflowUserId?: string;
  }): Promise<TeamPlaybookInstantiationResult> {
    this.requirePermission({
      workspaceId: payload.workspaceId,
      actorUserId: payload.actorUserId,
      action: 'workspace.workflows.run',
    });

    const playbook = this.getPlaybook({
      workspaceId: payload.workspaceId,
      actorUserId: payload.actorUserId,
      playbookId: payload.playbookId,
    });
    if (!playbook) {
      throw new Error(`Playbook ${payload.playbookId} not found.`);
    }
    if (playbook.status !== 'active') {
      throw new Error(`Playbook ${playbook.name} is archived.`);
    }

    const resolvedParams = resolveParameterValues(playbook.parameters, payload.parameterValues);
    const nowIso = this.nowIso();
    const workflowUserId = payload.workflowUserId ?? playbook.createdByUserId;

    const workflowDraft: Workflow = {
      id: makeId('workflow'),
      userId: workflowUserId,
      name: renderTemplateString(playbook.name, resolvedParams),
      description: renderTemplateString(playbook.description, resolvedParams),
      naturalLanguagePrompt: renderTemplateString(
        playbook.naturalLanguagePromptTemplate,
        resolvedParams
      ),
      trigger: normalizeTrigger(playbook.triggerTemplate, nowIso),
      steps: buildWorkflowSteps(playbook.stepTemplates, resolvedParams),
      status: 'ready',
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };

    const workflow = this.workflowEngine.saveWorkflow(workflowUserId, workflowDraft);

    let execution: WorkflowExecution | undefined;
    const executionHistory: TeamPlaybookExecutionRecord[] = [];
    if (payload.runNow) {
      execution = await this.workflowEngine.runWorkflowById({
        userId: workflowUserId,
        workflowId: workflow.id,
        triggerType: 'manual',
      });
      executionHistory.push({
        executionId: execution.id,
        status: execution.status,
        startedAtIso: execution.startedAtIso,
        finishedAtIso: execution.finishedAtIso,
        durationMs: execution.durationMs,
      });
    }

    const instance: TeamPlaybookInstance = {
      id: makeId('playbook-instance'),
      workspaceId: payload.workspaceId,
      playbookId: playbook.id,
      playbookName: playbook.name,
      workflowId: workflow.id,
      workflowUserId,
      createdByUserId: payload.actorUserId,
      parameterValues: resolvedParams,
      executionHistory,
      lastExecutionStatus: execution?.status,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };

    const current = this.instancesByWorkspaceId.get(payload.workspaceId) ?? [];
    this.instancesByWorkspaceId.set(payload.workspaceId, [instance, ...current]);
    return { playbook, workflow, instance, execution };
  }

  async runPlaybookInstance(payload: {
    workspaceId: string;
    instanceId: string;
    actorUserId: string;
  }): Promise<{ instance: TeamPlaybookInstance; execution: WorkflowExecution }> {
    this.requirePermission({
      workspaceId: payload.workspaceId,
      actorUserId: payload.actorUserId,
      action: 'workspace.workflows.run',
    });

    const instances = this.instancesByWorkspaceId.get(payload.workspaceId) ?? [];
    const index = instances.findIndex((instance) => instance.id === payload.instanceId);
    if (index === -1) {
      throw new Error(`Playbook instance ${payload.instanceId} not found.`);
    }

    const instance = instances[index];
    const execution = await this.workflowEngine.runWorkflowById({
      userId: instance.workflowUserId,
      workflowId: instance.workflowId,
      triggerType: 'manual',
    });

    const updated: TeamPlaybookInstance = {
      ...instance,
      lastExecutionStatus: execution.status,
      updatedAtIso: this.nowIso(),
      executionHistory: [
        {
          executionId: execution.id,
          status: execution.status,
          startedAtIso: execution.startedAtIso,
          finishedAtIso: execution.finishedAtIso,
          durationMs: execution.durationMs,
        },
        ...instance.executionHistory,
      ],
    };

    const next = [...instances];
    next[index] = updated;
    this.instancesByWorkspaceId.set(payload.workspaceId, byUpdatedAtDesc(next));
    return { instance: updated, execution };
  }

  getParameterDefaults(playbook: TeamPlaybookTemplate): Record<string, string> {
    const defaults: Record<string, string> = {};
    for (const definition of playbook.parameters) {
      defaults[definition.key] = definition.defaultValue ?? '';
    }
    return defaults;
  }

  private requirePermission(payload: {
    workspaceId: string;
    actorUserId: string;
    action: WorkspacePermission;
  }): void {
    const actorRole = this.resolveMemberRole({
      workspaceId: payload.workspaceId,
      userId: payload.actorUserId,
    });
    if (!actorRole) {
      throw new Error(`User ${payload.actorUserId} is not a member of workspace ${payload.workspaceId}.`);
    }

    assertWorkspacePermission({
      workspaceId: payload.workspaceId,
      actorUserId: payload.actorUserId,
      actorRole,
      action: payload.action,
      workspaceOwnerUserId: this.resolveWorkspaceOwnerUserId(payload.workspaceId) ?? undefined,
    });
  }
}

export const teamPlaybookManager = new TeamPlaybookManager();

