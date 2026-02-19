import {
  listActivityEvents,
  type ActivityStore,
  activityStore,
} from '../activity';
import {
  searchKnowledgeSources,
  type KnowledgeGraphStore,
  knowledgeGraphStore,
} from '../knowledge';
import { orgManager, type OrgManager } from './orgManager';
import {
  workflowEngine,
  type WorkflowEngine,
} from '../workflows';
import {
  workspaceManager,
  type WorkspaceManager,
} from '../team/workspaceManager';
import type { EnterpriseAnalyticsReport, EnterpriseAnalyticsWorkspaceRow } from './types';

interface EnterpriseAnalyticsDependencies {
  orgManager?: Pick<OrgManager, 'getOrganization'>;
  workspaceManager?: Pick<WorkspaceManager, 'listMembers'>;
  activityStore?: ActivityStore;
  workflowEngine?: Pick<WorkflowEngine, 'listWorkflows'>;
  knowledgeStore?: KnowledgeGraphStore;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const toMs = (iso: string): number => {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const clamp01 = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return Number(value.toFixed(4));
};

const countUniqueUsersWithEvents = (
  eventsByUser: Map<string, Array<{ createdAtIso: string }>>,
  fromMs: number,
  toMsLimit: number
): number => {
  let count = 0;
  for (const [, events] of eventsByUser.entries()) {
    const hasEvent = events.some((event) => {
      const ts = toMs(event.createdAtIso);
      return ts >= fromMs && ts <= toMsLimit;
    });
    if (hasEvent) count += 1;
  }
  return count;
};

const connectorFromActionId = (actionId: string): string | null => {
  const parts = actionId.split('.');
  if (parts.length < 3 || parts[0] !== 'connector') return null;
  return parts[1] ?? null;
};

export const generateEnterpriseAnalytics = (
  payload: {
    organizationId: string;
    actorUserId: string;
    rangeDays?: number;
    nowIso?: string;
  },
  dependencies: EnterpriseAnalyticsDependencies = {}
): EnterpriseAnalyticsReport => {
  const nowIso = payload.nowIso ?? new Date().toISOString();
  const nowMs = toMs(nowIso);
  const rangeDays = Math.max(7, Math.min(180, Math.floor(payload.rangeDays ?? 30)));
  const windowStartMs = nowMs - rangeDays * DAY_MS;

  const orgManagerRef = dependencies.orgManager ?? orgManager;
  const workspaceManagerRef = dependencies.workspaceManager ?? workspaceManager;
  const activityStoreRef = dependencies.activityStore ?? activityStore;
  const workflowEngineRef = dependencies.workflowEngine ?? workflowEngine;
  const knowledgeStoreRef = dependencies.knowledgeStore ?? knowledgeGraphStore;

  const organization = orgManagerRef.getOrganization(payload.organizationId);
  if (!organization) {
    throw new Error(`Organization ${payload.organizationId} not found.`);
  }

  const connectorCounts = new Map<string, number>();
  const rows: EnterpriseAnalyticsWorkspaceRow[] = [];

  for (const workspaceId of organization.workspaceIds) {
    let memberUserIds: string[] = [];
    try {
      memberUserIds = workspaceManagerRef
        .listMembers(workspaceId, payload.actorUserId)
        .filter((member) => !member.removedAtIso)
        .map((member) => member.userId);
    } catch {
      memberUserIds = [];
    }

    const eventsByUser = new Map<string, Array<{ createdAtIso: string; eventType: string; category: string }>>();
    let workflowRuns = 0;
    let workflowSuccesses = 0;
    let apiCalls = 0;
    let knowledgeSources = 0;

    for (const userId of memberUserIds) {
      const events = listActivityEvents(
        {
          userId,
          filter: {
            dateFromIso: new Date(windowStartMs).toISOString(),
            dateToIso: nowIso,
          },
          limit: 4000,
        },
        activityStoreRef
      ).map((event) => ({
        createdAtIso: event.createdAtIso,
        eventType: event.eventType,
        category: event.category,
      }));

      eventsByUser.set(userId, events);

      for (const event of events) {
        if (event.category === 'workflow') {
          workflowRuns += 1;
          if (/completed|run_completed|background_completed/.test(event.eventType)) {
            workflowSuccesses += 1;
          }
        }

        if (event.eventType.startsWith('api.')) {
          apiCalls += 1;
        }
      }

      const workflows = workflowEngineRef.listWorkflows(userId);
      for (const workflow of workflows) {
        for (const step of workflow.steps) {
          const connectorId = connectorFromActionId(step.actionId);
          if (connectorId) {
            connectorCounts.set(connectorId, (connectorCounts.get(connectorId) ?? 0) + 1);
          }
        }
      }

      const sources = searchKnowledgeSources(
        {
          userId,
          type: 'all',
        },
        knowledgeStoreRef
      ).filter((source) => {
        const createdAt = toMs(source.createdAtIso);
        return createdAt >= windowStartMs && createdAt <= nowMs;
      });
      knowledgeSources += sources.length;
    }

    const activeUsersDaily = countUniqueUsersWithEvents(eventsByUser, nowMs - DAY_MS, nowMs);
    const activeUsersWeekly = countUniqueUsersWithEvents(eventsByUser, nowMs - 7 * DAY_MS, nowMs);
    const activeUsersMonthly = countUniqueUsersWithEvents(eventsByUser, nowMs - 30 * DAY_MS, nowMs);

    rows.push({
      workspaceId,
      activeUsersDaily,
      activeUsersWeekly,
      activeUsersMonthly,
      workflowRuns,
      workflowSuccessRate: workflowRuns === 0 ? 0 : clamp01(workflowSuccesses / workflowRuns),
      apiCalls,
      knowledgeSources,
    });
  }

  const totals = {
    activeUsersWeekly: rows.reduce((sum, row) => sum + row.activeUsersWeekly, 0),
    workflowRuns: rows.reduce((sum, row) => sum + row.workflowRuns, 0),
    apiCalls: rows.reduce((sum, row) => sum + row.apiCalls, 0),
    knowledgeGrowthRate:
      rangeDays === 0
        ? 0
        : Number((rows.reduce((sum, row) => sum + row.knowledgeSources, 0) / rangeDays).toFixed(3)),
  };

  return {
    organizationId: organization.id,
    generatedAtIso: nowIso,
    rangeDays,
    workspaces: rows,
    mostUsedConnectors: Array.from(connectorCounts.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 8)
      .map(([connectorId, uses]) => ({ connectorId, uses })),
    totals,
  };
};
