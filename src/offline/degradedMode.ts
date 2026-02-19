import { retrieveKnowledge } from '../knowledge';
import { workflowStore } from '../workflows';
import type { QueuedMessageRecord } from './messageQueue';

export interface OfflineKnowledgeHit {
  sourceId: string;
  sourceTitle: string;
  snippet: string;
  score: number;
}

export interface OfflineWorkflowStatus {
  workflowId: string;
  name: string;
  status: string;
  lastExecutionId?: string;
  updatedAtIso: string;
}

export const searchOfflineKnowledge = (payload: {
  userId: string;
  query: string;
  topK?: number;
}): OfflineKnowledgeHit[] => {
  const result = retrieveKnowledge({
    userId: payload.userId,
    query: payload.query,
    topK: payload.topK ?? 4,
  });
  return result.hits.map((hit) => ({
    sourceId: hit.source.id,
    sourceTitle: hit.source.title,
    snippet: hit.node.text.slice(0, 200),
    score: hit.score,
  }));
};

export const generateOfflineTemplateResponse = (payload: {
  personaName?: string;
  personaTone?: 'direct' | 'warm' | 'balanced' | 'analytical';
  userMessage: string;
  queuedCount: number;
}): string => {
  const name = payload.personaName?.trim() || 'Assistant';
  const tone = payload.personaTone ?? 'balanced';
  const opening =
    tone === 'direct'
      ? 'Quick fallback response while offline.'
      : tone === 'warm'
        ? 'I am here with you while we are offline.'
        : tone === 'analytical'
          ? 'Offline fallback activated with constrained reasoning.'
          : 'Offline fallback response generated.';

  return `${name}: ${opening} I captured "${payload.userMessage}". ` +
    `I queued your request (${payload.queuedCount} pending) and will run full processing once connectivity returns.`;
};

export const listOfflineWorkflowStatus = (payload: {
  userId: string;
  limit?: number;
}): OfflineWorkflowStatus[] => {
  const state = workflowStore.load(payload.userId);
  return state.workflows
    .slice(0, Math.max(1, payload.limit ?? 10))
    .map((workflow) => ({
      workflowId: workflow.id,
      name: workflow.name,
      status: workflow.status,
      lastExecutionId: workflow.lastExecutionId,
      updatedAtIso: workflow.updatedAtIso,
    }));
};

export const reorderQueuedByPriority = (
  records: ReadonlyArray<QueuedMessageRecord>
): QueuedMessageRecord[] => {
  const weight = (priority: QueuedMessageRecord['priority']): number => {
    if (priority === 'high') return 3;
    if (priority === 'low') return 1;
    return 2;
  };

  return [...records].sort((left, right) => {
    const delta = weight(right.priority) - weight(left.priority);
    if (delta !== 0) return delta;
    return Date.parse(left.enqueuedAtIso) - Date.parse(right.enqueuedAtIso);
  });
};
