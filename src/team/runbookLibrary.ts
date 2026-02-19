import type { WorkflowTrigger } from '../workflows';
import {
  TeamPlaybookManager,
  teamPlaybookManager,
  type TeamPlaybookCategory,
  type TeamPlaybookInstantiationResult,
  type TeamPlaybookParameterDefinition,
  type TeamPlaybookStepTemplate,
  type TeamPlaybookTemplate,
} from './playbooks';

export interface BuiltInRunbookDefinition {
  id: string;
  category: TeamPlaybookCategory;
  name: string;
  description: string;
  naturalLanguagePromptTemplate: string;
  parameters: TeamPlaybookParameterDefinition[];
  stepTemplates: TeamPlaybookStepTemplate[];
  triggerTemplate?: Partial<WorkflowTrigger>;
}

const BUILT_IN_RUNBOOKS: BuiltInRunbookDefinition[] = [
  {
    id: 'operations.weekly-standup-summary',
    category: 'operations',
    name: 'Weekly Standup Summary',
    description: 'Generate a concise standup digest for {{team_name}} covering {{timeframe}}.',
    naturalLanguagePromptTemplate:
      'Summarize team updates, blockers, and wins for {{team_name}} during {{timeframe}}.',
    parameters: [
      {
        key: 'team_name',
        label: 'Team Name',
        required: true,
        defaultValue: 'Core Team',
      },
      {
        key: 'timeframe',
        label: 'Timeframe',
        required: true,
        defaultValue: 'this week',
      },
    ],
    stepTemplates: [
      {
        title: 'Collect context for {{team_name}}',
        description: 'Retrieve notes and workflow output for {{timeframe}}.',
        kind: 'transform',
        actionId: 'transform.collect_context',
        inputTemplate: '{"query":"{{team_name}} updates {{timeframe}}","topK":6}',
      },
      {
        title: 'Summarize standup themes',
        description: 'Synthesize blockers, wins, and priorities.',
        kind: 'transform',
        actionId: 'transform.summarize',
      },
      {
        title: 'Publish standup artifact',
        description: 'Publish summary artifact for team visibility.',
        kind: 'artifact',
        actionId: 'artifact.publish',
      },
    ],
    triggerTemplate: {
      type: 'schedule',
      enabled: true,
      schedule: {
        intervalMinutes: 7 * 24 * 60,
        nextRunAtIso: new Date().toISOString(),
        cronLike: 'WEEKLY@MON09:00',
      },
    },
  },
  {
    id: 'engineering.sprint-retrospective-synthesis',
    category: 'engineering',
    name: 'Sprint Retrospective Synthesis',
    description: 'Compile a retrospective for sprint {{sprint_name}}.',
    naturalLanguagePromptTemplate:
      'Generate sprint retrospective outcomes for {{sprint_name}} with themes and follow-ups.',
    parameters: [
      {
        key: 'sprint_name',
        label: 'Sprint Name',
        required: true,
        defaultValue: 'Sprint 1',
      },
      {
        key: 'focus_area',
        label: 'Focus Area',
        required: false,
        defaultValue: 'delivery quality',
      },
    ],
    stepTemplates: [
      {
        title: 'Collect sprint context',
        description: 'Gather engineering notes for {{sprint_name}} and {{focus_area}}.',
        kind: 'transform',
        actionId: 'transform.collect_context',
        inputTemplate: '{"query":"{{sprint_name}} {{focus_area}} retrospective","topK":7}',
      },
      {
        title: 'Synthesize retrospective findings',
        description: 'Summarize what worked, what failed, and what to improve.',
        kind: 'transform',
        actionId: 'transform.summarize',
      },
      {
        title: 'Publish retrospective brief',
        description: 'Publish artifact with follow-up actions.',
        kind: 'artifact',
        actionId: 'artifact.publish',
      },
    ],
  },
  {
    id: 'sales.pipeline-forecast-brief',
    category: 'sales',
    name: 'Pipeline Forecast Brief',
    description: 'Build a weekly forecast brief for region {{region}}.',
    naturalLanguagePromptTemplate:
      'Summarize active pipeline, risks, and forecast confidence for {{region}}.',
    parameters: [
      {
        key: 'region',
        label: 'Region',
        required: true,
        defaultValue: 'North America',
      },
      {
        key: 'quarter',
        label: 'Quarter',
        required: true,
        defaultValue: 'Q1',
      },
    ],
    stepTemplates: [
      {
        title: 'Collect pipeline context',
        description: 'Gather pipeline notes and updates for {{region}} in {{quarter}}.',
        kind: 'transform',
        actionId: 'transform.collect_context',
        inputTemplate: '{"query":"sales pipeline {{region}} {{quarter}}","topK":6}',
      },
      {
        title: 'Generate forecast summary',
        description: 'Summarize confidence bands and key risks.',
        kind: 'transform',
        actionId: 'transform.summarize',
      },
      {
        title: 'Publish forecast brief',
        description: 'Publish weekly sales forecast artifact.',
        kind: 'artifact',
        actionId: 'artifact.publish',
      },
    ],
  },
  {
    id: 'hr.new-hire-onboarding-checklist',
    category: 'hr',
    name: 'New Hire Onboarding Checklist',
    description: 'Create onboarding checklist for {{hire_name}} ({{role_title}}).',
    naturalLanguagePromptTemplate:
      'Generate onboarding checklist and first-week plan for {{hire_name}} as {{role_title}}.',
    parameters: [
      {
        key: 'hire_name',
        label: 'Hire Name',
        required: true,
        defaultValue: 'New Hire',
      },
      {
        key: 'role_title',
        label: 'Role Title',
        required: true,
        defaultValue: 'Team Member',
      },
    ],
    stepTemplates: [
      {
        title: 'Collect onboarding context',
        description: 'Gather onboarding notes for {{role_title}} role expectations.',
        kind: 'transform',
        actionId: 'transform.collect_context',
        inputTemplate: '{"query":"onboarding checklist {{role_title}}","topK":5}',
      },
      {
        title: 'Draft onboarding plan',
        description: 'Synthesize week one checklist and milestones.',
        kind: 'transform',
        actionId: 'transform.summarize',
      },
      {
        title: 'Publish onboarding artifact',
        description: 'Publish onboarding plan for manager review.',
        kind: 'artifact',
        actionId: 'artifact.publish',
      },
    ],
  },
  {
    id: 'research.competitive-landscape-scan',
    category: 'research',
    name: 'Competitive Landscape Scan',
    description: 'Create a landscape scan on topic {{research_topic}}.',
    naturalLanguagePromptTemplate:
      'Summarize current signals, competitors, and open questions for {{research_topic}}.',
    parameters: [
      {
        key: 'research_topic',
        label: 'Research Topic',
        required: true,
        defaultValue: 'AI assistant workflows',
      },
      {
        key: 'horizon',
        label: 'Horizon',
        required: true,
        defaultValue: 'next 6 months',
      },
    ],
    stepTemplates: [
      {
        title: 'Collect research context',
        description: 'Gather notes for {{research_topic}} across {{horizon}} horizon.',
        kind: 'transform',
        actionId: 'transform.collect_context',
        inputTemplate: '{"query":"{{research_topic}} {{horizon}}","topK":8}',
      },
      {
        title: 'Synthesize landscape',
        description: 'Summarize emerging patterns and strategic implications.',
        kind: 'transform',
        actionId: 'transform.summarize',
      },
      {
        title: 'Publish research brief',
        description: 'Publish landscape artifact for the team.',
        kind: 'artifact',
        actionId: 'artifact.publish',
      },
    ],
  },
];

export const listBuiltInRunbooks = (payload: {
  category?: TeamPlaybookCategory;
} = {}): BuiltInRunbookDefinition[] => {
  if (!payload.category) return [...BUILT_IN_RUNBOOKS];
  return BUILT_IN_RUNBOOKS.filter((runbook) => runbook.category === payload.category);
};

export const getBuiltInRunbook = (runbookId: string): BuiltInRunbookDefinition | null =>
  BUILT_IN_RUNBOOKS.find((runbook) => runbook.id === runbookId) ?? null;

export const installBuiltInRunbook = (payload: {
  workspaceId: string;
  actorUserId: string;
  runbookId: string;
  manager?: TeamPlaybookManager;
}): TeamPlaybookTemplate => {
  const manager = payload.manager ?? teamPlaybookManager;
  const runbook = getBuiltInRunbook(payload.runbookId);
  if (!runbook) {
    throw new Error(`Runbook ${payload.runbookId} not found.`);
  }

  const existing = manager.findPlaybookBySourceRunbookId({
    workspaceId: payload.workspaceId,
    actorUserId: payload.actorUserId,
    sourceRunbookId: runbook.id,
  });
  if (existing) return existing;

  return manager.createPlaybook({
    workspaceId: payload.workspaceId,
    createdByUserId: payload.actorUserId,
    name: runbook.name,
    description: runbook.description,
    category: runbook.category,
    naturalLanguagePromptTemplate: runbook.naturalLanguagePromptTemplate,
    parameters: runbook.parameters,
    stepTemplates: runbook.stepTemplates,
    triggerTemplate: runbook.triggerTemplate,
    sourceRunbookId: runbook.id,
  });
};

export const instantiateBuiltInRunbook = async (payload: {
  workspaceId: string;
  actorUserId: string;
  runbookId: string;
  parameterValues?: Record<string, string>;
  runNow?: boolean;
  manager?: TeamPlaybookManager;
}): Promise<TeamPlaybookInstantiationResult> => {
  const manager = payload.manager ?? teamPlaybookManager;
  const playbook = installBuiltInRunbook({
    workspaceId: payload.workspaceId,
    actorUserId: payload.actorUserId,
    runbookId: payload.runbookId,
    manager,
  });

  return manager.instantiatePlaybook({
    workspaceId: payload.workspaceId,
    playbookId: playbook.id,
    actorUserId: payload.actorUserId,
    parameterValues: payload.parameterValues,
    runNow: payload.runNow,
  });
};

