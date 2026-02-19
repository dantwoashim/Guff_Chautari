import { describe, expect, it } from 'vitest';
import { ingestKnowledgeNote } from '../../knowledge';
import { workflowStore } from '../../workflows';
import {
  generateOfflineTemplateResponse,
  listOfflineWorkflowStatus,
  searchOfflineKnowledge,
} from '../degradedMode';

describe('offline degraded mode helpers', () => {
  it('returns cached knowledge search hits while offline', () => {
    const userId = 'offline-user-1';
    ingestKnowledgeNote({
      userId,
      title: 'Weekly Review Protocol',
      text: 'Run a weekly review with one metric and one risk mitigation item.',
      nowIso: '2026-02-18T09:00:00.000Z',
    });

    const hits = searchOfflineKnowledge({
      userId,
      query: 'weekly review metric',
      topK: 3,
    });

    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].sourceTitle).toContain('Weekly Review');
  });

  it('builds persona-consistent fallback responses and workflow status snapshots', () => {
    const userId = 'offline-user-2';
    workflowStore.upsertWorkflow(userId, {
      id: 'wf-offline-1',
      userId,
      name: 'Offline Workflow',
      description: 'test',
      naturalLanguagePrompt: 'test',
      trigger: { id: 'trigger-1', type: 'manual', enabled: true },
      steps: [],
      status: 'ready',
      createdAtIso: '2026-02-18T10:00:00.000Z',
      updatedAtIso: '2026-02-18T10:05:00.000Z',
    });

    const response = generateOfflineTemplateResponse({
      personaName: 'Execution Coach',
      personaTone: 'direct',
      userMessage: 'Help me prioritize the week.',
      queuedCount: 2,
    });
    expect(response).toContain('Execution Coach');
    expect(response).toContain('queued');

    const statuses = listOfflineWorkflowStatus({
      userId,
      limit: 5,
    });
    expect(statuses[0].name).toBe('Offline Workflow');
  });
});
