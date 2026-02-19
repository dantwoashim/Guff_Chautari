import {
  listActivityEvents,
  type ActivityEvent,
  type ActivityStore,
  activityStore,
} from '../activity';
import { searchKnowledgeSources, type KnowledgeGraphStore, knowledgeGraphStore } from '../knowledge';
import { workflowEngine, type WorkflowEngine, type WorkflowExecutionStatus } from '../workflows';
import { assertWorkspacePermission, type WorkspacePermission } from './permissions';
import { workspaceManager, type WorkspaceManager } from './workspaceManager';
import type { WorkspaceMember, WorkspaceRole } from './types';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const toMs = (iso: string): number => {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const startOfDayIso = (iso: string): string => {
  const date = new Date(iso);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
};

const startOfWeekIso = (iso: string): string => {
  const date = new Date(iso);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
};

const endOfWeekIso = (weekStartIso: string): string => {
  const date = new Date(weekStartIso);
  date.setDate(date.getDate() + 7);
  date.setMilliseconds(-1);
  return date.toISOString();
};

const prettyDate = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

const upsertCount = (map: Map<string, number>, key: string): void => {
  map.set(key, (map.get(key) ?? 0) + 1);
};

export interface TeamBriefingWeekBucket {
  weekStartIso: string;
  weekEndIso: string;
  label: string;
  totalEvents: number;
}

export interface TeamBriefingKeyDecision {
  userId: string;
  eventType: string;
  title: string;
  createdAtIso: string;
}

export interface TeamBriefingKnowledgeAddition {
  userId: string;
  sourceId: string;
  sourceType: string;
  title: string;
  createdAtIso: string;
}

export interface TeamBriefingWorkflowSummary {
  totalWorkflowEvents: number;
  completed: number;
  failed: number;
  pendingReview: number;
  activeWorkflows: number;
  upcomingScheduledTasks: number;
}

export interface TeamBriefingUpcomingTask {
  userId: string;
  workflowId: string;
  workflowName: string;
  nextRunAtIso: string;
}

export interface TeamBriefingMemberActivity {
  userId: string;
  role: WorkspaceRole;
  totalEvents: number;
  activeDays: number;
  topCategory: string;
}

export interface TeamBriefingHeatmapRow {
  userId: string;
  role: WorkspaceRole;
  counts: number[];
}

export interface TeamBriefingHeatmap {
  dayLabels: string[];
  rows: TeamBriefingHeatmapRow[];
}

export interface TeamWeeklyBriefing {
  workspaceId: string;
  workspaceName: string;
  generatedAtIso: string;
  weekWindowStartIso: string;
  weekWindowEndIso: string;
  weeks: number;
  summary: string;
  highlights: string[];
  followUps: string[];
  weekBuckets: TeamBriefingWeekBucket[];
  keyDecisions: TeamBriefingKeyDecision[];
  recentKnowledgeAdditions: TeamBriefingKnowledgeAddition[];
  workflowSummary: TeamBriefingWorkflowSummary;
  upcomingScheduledTasks: TeamBriefingUpcomingTask[];
  memberActivity: TeamBriefingMemberActivity[];
  heatmap: TeamBriefingHeatmap;
}

interface TeamBriefingDependencies {
  activityStore?: ActivityStore;
  workspaceManager?: Pick<WorkspaceManager, 'getWorkspace' | 'getMemberRole' | 'listMembers'>;
  workflowEngine?: Pick<WorkflowEngine, 'listWorkflows'>;
  knowledgeStore?: KnowledgeGraphStore;
}

const collectWorkspaceMembers = (
  payload: {
    workspaceId: string;
    actorUserId: string;
  },
  manager: Pick<WorkspaceManager, 'getWorkspace' | 'getMemberRole' | 'listMembers'>
): { workspaceName: string; members: WorkspaceMember[] } => {
  const workspace = manager.getWorkspace(payload.workspaceId);
  if (!workspace) {
    throw new Error(`Workspace ${payload.workspaceId} not found.`);
  }

  const actorRole = manager.getMemberRole(payload.workspaceId, payload.actorUserId);
  if (!actorRole) {
    throw new Error(`User ${payload.actorUserId} is not a member of workspace ${payload.workspaceId}.`);
  }

  assertWorkspacePermission({
    workspaceId: payload.workspaceId,
    actorUserId: payload.actorUserId,
    actorRole,
    action: 'workspace.read' as WorkspacePermission,
    workspaceOwnerUserId: workspace.createdByUserId,
  });

  const members = manager.listMembers(payload.workspaceId, payload.actorUserId);
  return {
    workspaceName: workspace.name,
    members,
  };
};

const buildWeekBuckets = (payload: {
  weeks: number;
  windowStartIso: string;
  events: ReadonlyArray<ActivityEvent>;
}): TeamBriefingWeekBucket[] => {
  const buckets: TeamBriefingWeekBucket[] = [];
  const startMs = toMs(payload.windowStartIso);

  for (let index = 0; index < payload.weeks; index += 1) {
    const weekStartMs = startMs + index * WEEK_MS;
    const weekStartIso = new Date(weekStartMs).toISOString();
    const weekEndIso = endOfWeekIso(weekStartIso);
    const weekEndMs = toMs(weekEndIso);
    const totalEvents = payload.events.filter((event) => {
      const eventMs = toMs(event.createdAtIso);
      return eventMs >= weekStartMs && eventMs <= weekEndMs;
    }).length;

    buckets.push({
      weekStartIso,
      weekEndIso,
      label: `${prettyDate(weekStartIso)} - ${prettyDate(weekEndIso)}`,
      totalEvents,
    });
  }

  return buckets;
};

const buildMemberActivity = (
  members: ReadonlyArray<WorkspaceMember>,
  eventsByUserId: Map<string, ActivityEvent[]>
): TeamBriefingMemberActivity[] => {
  return members
    .map((member) => {
      const events = eventsByUserId.get(member.userId) ?? [];
      const categoryCounts = new Map<string, number>();
      const activeDays = new Set<string>();

      for (const event of events) {
        upsertCount(categoryCounts, event.category);
        activeDays.add(startOfDayIso(event.createdAtIso));
      }

      const topCategory =
        [...categoryCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? 'none';

      return {
        userId: member.userId,
        role: member.role,
        totalEvents: events.length,
        activeDays: activeDays.size,
        topCategory,
      };
    })
    .sort((left, right) => right.totalEvents - left.totalEvents);
};

const buildHeatmap = (payload: {
  windowStartIso: string;
  windowEndIso: string;
  members: ReadonlyArray<WorkspaceMember>;
  eventsByUserId: Map<string, ActivityEvent[]>;
}): TeamBriefingHeatmap => {
  const startMs = toMs(startOfDayIso(payload.windowStartIso));
  const endMs = toMs(startOfDayIso(payload.windowEndIso));
  const dayIsos: string[] = [];
  for (let cursor = startMs; cursor <= endMs; cursor += DAY_MS) {
    dayIsos.push(new Date(cursor).toISOString());
  }

  const dayLabels = dayIsos.map((iso) => prettyDate(iso));
  const rows = payload.members.map((member) => {
    const events = payload.eventsByUserId.get(member.userId) ?? [];
    const dayCounts = new Map<string, number>();
    for (const event of events) {
      const dayIso = startOfDayIso(event.createdAtIso);
      upsertCount(dayCounts, dayIso);
    }

    return {
      userId: member.userId,
      role: member.role,
      counts: dayIsos.map((dayIso) => dayCounts.get(dayIso) ?? 0),
    };
  });

  return { dayLabels, rows };
};

export const generateTeamWeeklyBriefing = (
  payload: {
    workspaceId: string;
    actorUserId: string;
    weeks?: number;
    nowIso?: string;
  },
  dependencies: TeamBriefingDependencies = {}
): TeamWeeklyBriefing => {
  const nowIso = payload.nowIso ?? new Date().toISOString();
  const weeks = clamp(Math.floor(payload.weeks ?? 2), 1, 12);
  const activityStoreRef = dependencies.activityStore ?? activityStore;
  const workspaceManagerRef = dependencies.workspaceManager ?? workspaceManager;
  const workflowEngineRef = dependencies.workflowEngine ?? workflowEngine;
  const knowledgeStoreRef = dependencies.knowledgeStore ?? knowledgeGraphStore;

  const { workspaceName, members } = collectWorkspaceMembers(
    {
      workspaceId: payload.workspaceId,
      actorUserId: payload.actorUserId,
    },
    workspaceManagerRef
  );

  const currentWeekStartIso = startOfWeekIso(nowIso);
  const windowStartIso = new Date(toMs(currentWeekStartIso) - (weeks - 1) * WEEK_MS).toISOString();
  const windowEndIso = nowIso;

  const eventsByUserId = new Map<string, ActivityEvent[]>();
  const allEvents: ActivityEvent[] = [];

  for (const member of members) {
    const events = listActivityEvents(
      {
        userId: member.userId,
        filter: {
          dateFromIso: windowStartIso,
          dateToIso: windowEndIso,
        },
        limit: 2000,
      },
      activityStoreRef
    );
    eventsByUserId.set(member.userId, events);
    allEvents.push(...events);
  }

  allEvents.sort((left, right) => toMs(right.createdAtIso) - toMs(left.createdAtIso));

  const keyDecisions: TeamBriefingKeyDecision[] = allEvents
    .filter(
      (event) =>
        event.category === 'decision' ||
        event.eventType.startsWith('decision.') ||
        event.eventType.startsWith('boardroom.')
    )
    .slice(0, 10)
    .map((event) => ({
      userId: event.userId,
      eventType: event.eventType,
      title: event.title,
      createdAtIso: event.createdAtIso,
    }));

  const recentKnowledgeAdditions = members
    .flatMap((member) =>
      searchKnowledgeSources(
        {
          userId: member.userId,
          type: 'all',
        },
        knowledgeStoreRef
      )
        .filter((source) => {
          const createdAtMs = toMs(source.createdAtIso);
          return createdAtMs >= toMs(windowStartIso) && createdAtMs <= toMs(windowEndIso);
        })
        .map((source) => ({
          userId: member.userId,
          sourceId: source.id,
          sourceType: source.type,
          title: source.title,
          createdAtIso: source.createdAtIso,
        }))
    )
    .sort((left, right) => toMs(right.createdAtIso) - toMs(left.createdAtIso))
    .slice(0, 12);

  const workflowEvents = allEvents.filter((event) => event.category === 'workflow');
  const completedWorkflows = workflowEvents.filter((event) =>
    /(workflow\.completed|workflow\.run_completed|workflow\.background_completed)/.test(event.eventType)
  ).length;
  const failedWorkflows = workflowEvents.filter((event) => /failed/.test(event.eventType)).length;
  const pendingReviewWorkflows = workflowEvents.filter((event) =>
    /(approval_required|checkpoint_required)/.test(event.eventType)
  ).length;

  let activeWorkflows = 0;
  let upcomingScheduledTasks = 0;
  const upcomingTaskRows: TeamBriefingUpcomingTask[] = [];
  const nowMs = toMs(nowIso);
  for (const member of members) {
    const workflows = workflowEngineRef.listWorkflows(member.userId);
    for (const workflow of workflows) {
      if (workflow.status === 'ready') activeWorkflows += 1;
      if (workflow.trigger.type !== 'schedule' || !workflow.trigger.enabled) continue;
      const nextRunMs = toMs(workflow.trigger.schedule?.nextRunAtIso ?? '');
      if (nextRunMs >= nowMs) {
        upcomingScheduledTasks += 1;
        if (workflow.trigger.schedule?.nextRunAtIso) {
          upcomingTaskRows.push({
            userId: member.userId,
            workflowId: workflow.id,
            workflowName: workflow.name,
            nextRunAtIso: workflow.trigger.schedule.nextRunAtIso,
          });
        }
      }
    }
  }
  upcomingTaskRows.sort((left, right) => toMs(left.nextRunAtIso) - toMs(right.nextRunAtIso));

  const workflowSummary: TeamBriefingWorkflowSummary = {
    totalWorkflowEvents: workflowEvents.length,
    completed: completedWorkflows,
    failed: failedWorkflows,
    pendingReview: pendingReviewWorkflows,
    activeWorkflows,
    upcomingScheduledTasks,
  };

  const memberActivity = buildMemberActivity(members, eventsByUserId);
  const heatmap = buildHeatmap({
    windowStartIso,
    windowEndIso,
    members,
    eventsByUserId,
  });
  const weekBuckets = buildWeekBuckets({
    weeks,
    windowStartIso,
    events: allEvents,
  });

  const topMember = memberActivity[0];
  const highlights: string[] = [
    `Captured ${allEvents.length} activity events across ${members.length} workspace members.`,
    topMember
      ? `Most active member: ${topMember.userId} (${topMember.totalEvents} event(s), top category ${topMember.topCategory}).`
      : 'No member activity recorded in selected window.',
    `Workflow outcomes: ${workflowSummary.completed} completed, ${workflowSummary.failed} failed, ${workflowSummary.pendingReview} pending review.`,
    `Knowledge additions: ${recentKnowledgeAdditions.length} source(s) ingested.`,
    `Key decisions tracked: ${keyDecisions.length}.`,
  ];

  const followUps: string[] = [];
  if (keyDecisions.length === 0) {
    followUps.push('Record at least one Decision Room or Boardroom outcome this week.');
  }
  if (workflowSummary.failed > workflowSummary.completed) {
    followUps.push('Investigate workflow failures and tighten runbook policies before adding more automations.');
  }
  if (recentKnowledgeAdditions.length === 0) {
    followUps.push('Ingest at least one note/file/url so team workflows can retrieve fresh context.');
  }
  if (followUps.length === 0) {
    followUps.push('Repeat your highest-performing playbook and compare week-over-week execution quality.');
  }

  return {
    workspaceId: payload.workspaceId,
    workspaceName,
    generatedAtIso: nowIso,
    weekWindowStartIso: windowStartIso,
    weekWindowEndIso: windowEndIso,
    weeks,
    summary:
      `Team briefing for ${workspaceName} covering ${weeks} week(s), from ${prettyDate(
        windowStartIso
      )} to ${prettyDate(windowEndIso)}.`,
    highlights,
    followUps,
    weekBuckets,
    keyDecisions,
    recentKnowledgeAdditions,
    workflowSummary,
    upcomingScheduledTasks: upcomingTaskRows.slice(0, 12),
    memberActivity,
    heatmap,
  };
};
