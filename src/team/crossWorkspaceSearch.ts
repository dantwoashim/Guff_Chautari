import { listActivityEvents, type ActivityStore, activityStore } from '../activity';
import {
  searchKnowledgeSources,
  type KnowledgeGraphStore,
  knowledgeGraphStore,
} from '../knowledge';
import { workflowEngine, type WorkflowEngine } from '../workflows';
import { assertWorkspacePermission } from './permissions';
import { workspaceManager, type WorkspaceManager } from './workspaceManager';

const DAY_MS = 24 * 60 * 60 * 1000;

const toMs = (iso: string): number => {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const tokenize = (value: string): string[] =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);

const lexicalScore = (query: string, text: string): number => {
  const queryTokens = [...new Set(tokenize(query))];
  if (queryTokens.length === 0) return 0;
  const textTokenSet = new Set(tokenize(text));
  const overlap = queryTokens.filter((token) => textTokenSet.has(token)).length;
  const overlapRatio = overlap / queryTokens.length;
  const phraseBoost = text.toLowerCase().includes(query.toLowerCase()) ? 0.2 : 0;
  return Math.max(0, Math.min(1, overlapRatio + phraseBoost));
};

const recencyScore = (createdAtIso: string, nowIso: string): number => {
  const ageMs = Math.max(0, toMs(nowIso) - toMs(createdAtIso));
  const ageDays = ageMs / DAY_MS;
  return Math.max(0, Math.min(1, 1 / (1 + ageDays / 14)));
};

const combinedScore = (query: string, text: string, createdAtIso: string, nowIso: string): number => {
  const lexical = lexicalScore(query, text);
  const recency = recencyScore(createdAtIso, nowIso);
  return Number((lexical * 0.75 + recency * 0.25).toFixed(4));
};

export type WorkspaceSearchDomain = 'activity' | 'knowledge' | 'workflow';
export type WorkspaceSearchScope = 'personal' | 'workspace';

export interface CrossWorkspaceSearchResult {
  id: string;
  domain: WorkspaceSearchDomain;
  scope: WorkspaceSearchScope;
  workspaceId: string | null;
  workspaceName: string;
  originLabel: string;
  ownerUserId: string;
  title: string;
  snippet: string;
  createdAtIso: string;
  score: number;
}

export interface CrossWorkspaceSearchResponse {
  query: string;
  generatedAtIso: string;
  totalResults: number;
  searchedWorkspaceIds: string[];
  results: CrossWorkspaceSearchResult[];
}

interface WorkspaceSearchDependencies {
  workspaceManager?: Pick<WorkspaceManager, 'listWorkspacesForUser' | 'getMemberRole' | 'listMembers' | 'getWorkspace'>;
  activityStore?: ActivityStore;
  knowledgeStore?: KnowledgeGraphStore;
  workflowEngine?: Pick<WorkflowEngine, 'listWorkflows'>;
}

const toSnippet = (value: string, length = 180): string => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= length) return normalized;
  return `${normalized.slice(0, length - 3)}...`;
};

export const searchAcrossWorkspaces = (
  payload: {
    actorUserId: string;
    query: string;
    includePersonal?: boolean;
    limit?: number;
    nowIso?: string;
  },
  dependencies: WorkspaceSearchDependencies = {}
): CrossWorkspaceSearchResponse => {
  const query = payload.query.trim();
  if (!query) {
    throw new Error('Search query is required.');
  }

  const nowIso = payload.nowIso ?? new Date().toISOString();
  const includePersonal = payload.includePersonal ?? true;
  const limit = Math.max(1, payload.limit ?? 40);

  const manager = dependencies.workspaceManager ?? workspaceManager;
  const activityStoreRef = dependencies.activityStore ?? activityStore;
  const knowledgeStoreRef = dependencies.knowledgeStore ?? knowledgeGraphStore;
  const workflowEngineRef = dependencies.workflowEngine ?? workflowEngine;

  const results: CrossWorkspaceSearchResult[] = [];

  if (includePersonal) {
    const personalActivity = listActivityEvents(
      {
        userId: payload.actorUserId,
        filter: { searchTerm: query },
        limit: 80,
      },
      activityStoreRef
    );
    for (const event of personalActivity) {
      const text = `${event.title} ${event.description} ${event.eventType}`;
      results.push({
        id: `activity:personal:${event.id}`,
        domain: 'activity',
        scope: 'personal',
        workspaceId: null,
        workspaceName: 'Personal',
        originLabel: 'Personal',
        ownerUserId: payload.actorUserId,
        title: event.title,
        snippet: toSnippet(event.description),
        createdAtIso: event.createdAtIso,
        score: combinedScore(query, text, event.createdAtIso, nowIso),
      });
    }

    const personalKnowledge = searchKnowledgeSources(
      {
        userId: payload.actorUserId,
        term: query,
        type: 'all',
      },
      knowledgeStoreRef
    );
    for (const source of personalKnowledge) {
      const text = `${source.title} ${source.text} ${source.uri ?? ''}`;
      results.push({
        id: `knowledge:personal:${source.id}`,
        domain: 'knowledge',
        scope: 'personal',
        workspaceId: null,
        workspaceName: 'Personal',
        originLabel: 'Personal',
        ownerUserId: payload.actorUserId,
        title: source.title,
        snippet: toSnippet(source.text),
        createdAtIso: source.createdAtIso,
        score: combinedScore(query, text, source.createdAtIso, nowIso),
      });
    }

    const personalWorkflows = workflowEngineRef.listWorkflows(payload.actorUserId);
    for (const workflow of personalWorkflows) {
      const text = `${workflow.name} ${workflow.description} ${workflow.naturalLanguagePrompt}`;
      if (lexicalScore(query, text) <= 0) continue;
      results.push({
        id: `workflow:personal:${workflow.id}`,
        domain: 'workflow',
        scope: 'personal',
        workspaceId: null,
        workspaceName: 'Personal',
        originLabel: 'Personal',
        ownerUserId: payload.actorUserId,
        title: workflow.name,
        snippet: toSnippet(workflow.description || workflow.naturalLanguagePrompt),
        createdAtIso: workflow.updatedAtIso,
        score: combinedScore(query, text, workflow.updatedAtIso, nowIso),
      });
    }
  }

  const accessibleWorkspaces = manager.listWorkspacesForUser(payload.actorUserId);
  for (const workspace of accessibleWorkspaces) {
    const actorRole = manager.getMemberRole(workspace.id, payload.actorUserId);
    if (!actorRole) continue;
    assertWorkspacePermission({
      workspaceId: workspace.id,
      actorUserId: payload.actorUserId,
      actorRole,
      action: 'workspace.read',
      workspaceOwnerUserId: workspace.createdByUserId,
    });

    const members = manager.listMembers(workspace.id, payload.actorUserId);
    for (const member of members) {
      const originLabel =
        member.userId === payload.actorUserId
          ? `${workspace.name} (you)`
          : `${workspace.name} (${member.userId})`;

      const workspaceActivity = listActivityEvents(
        {
          userId: member.userId,
          filter: { searchTerm: query },
          limit: 80,
        },
        activityStoreRef
      );
      for (const event of workspaceActivity) {
        const text = `${event.title} ${event.description} ${event.eventType}`;
        results.push({
          id: `activity:${workspace.id}:${member.userId}:${event.id}`,
          domain: 'activity',
          scope: 'workspace',
          workspaceId: workspace.id,
          workspaceName: workspace.name,
          originLabel,
          ownerUserId: member.userId,
          title: event.title,
          snippet: toSnippet(event.description),
          createdAtIso: event.createdAtIso,
          score: combinedScore(query, text, event.createdAtIso, nowIso),
        });
      }

      const workspaceKnowledge = searchKnowledgeSources(
        {
          userId: member.userId,
          term: query,
          type: 'all',
        },
        knowledgeStoreRef
      );
      for (const source of workspaceKnowledge) {
        const text = `${source.title} ${source.text} ${source.uri ?? ''}`;
        results.push({
          id: `knowledge:${workspace.id}:${member.userId}:${source.id}`,
          domain: 'knowledge',
          scope: 'workspace',
          workspaceId: workspace.id,
          workspaceName: workspace.name,
          originLabel,
          ownerUserId: member.userId,
          title: source.title,
          snippet: toSnippet(source.text),
          createdAtIso: source.createdAtIso,
          score: combinedScore(query, text, source.createdAtIso, nowIso),
        });
      }

      const workspaceWorkflows = workflowEngineRef.listWorkflows(member.userId);
      for (const workflow of workspaceWorkflows) {
        const text = `${workflow.name} ${workflow.description} ${workflow.naturalLanguagePrompt}`;
        if (lexicalScore(query, text) <= 0) continue;
        results.push({
          id: `workflow:${workspace.id}:${member.userId}:${workflow.id}`,
          domain: 'workflow',
          scope: 'workspace',
          workspaceId: workspace.id,
          workspaceName: workspace.name,
          originLabel,
          ownerUserId: member.userId,
          title: workflow.name,
          snippet: toSnippet(workflow.description || workflow.naturalLanguagePrompt),
          createdAtIso: workflow.updatedAtIso,
          score: combinedScore(query, text, workflow.updatedAtIso, nowIso),
        });
      }
    }
  }

  const deduped = new Map<string, CrossWorkspaceSearchResult>();
  for (const result of results) {
    const previous = deduped.get(result.id);
    if (!previous || result.score > previous.score) {
      deduped.set(result.id, result);
    }
  }

  const sorted = [...deduped.values()]
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return toMs(right.createdAtIso) - toMs(left.createdAtIso);
    })
    .slice(0, limit);

  return {
    query,
    generatedAtIso: nowIso,
    totalResults: sorted.length,
    searchedWorkspaceIds: accessibleWorkspaces.map((workspace) => workspace.id),
    results: sorted,
  };
};
