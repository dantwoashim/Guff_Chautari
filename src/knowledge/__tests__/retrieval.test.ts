import { describe, expect, it } from 'vitest';
import {
  ingestKnowledgeNote,
  retrieveKnowledge,
  KnowledgeGraphStore,
  createInMemoryKnowledgeStoreAdapter,
} from '../index';

describe('knowledge retrieval', () => {
  it('ranks knowledge by hybrid semantic + recency + importance scoring', () => {
    const store = new KnowledgeGraphStore(createInMemoryKnowledgeStoreAdapter());
    const userId = 'user-knowledge-retrieval';

    ingestKnowledgeNote(
      {
        userId,
        title: 'Older strategy note',
        text: 'The roadmap depends on benchmark quality metrics and consistency guardrails for release confidence.',
        nowIso: '2025-01-10T10:00:00.000Z',
      },
      store
    );

    ingestKnowledgeNote(
      {
        userId,
        title: 'Fresh benchmark plan',
        text: 'Benchmark dashboard should track consistency, recall, latency, and weekly regressions with alerts.',
        nowIso: '2026-02-10T09:00:00.000Z',
      },
      store
    );

    ingestKnowledgeNote(
      {
        userId,
        title: 'Unrelated meal prep',
        text: 'Buy vegetables, prep lunch boxes, and organize grocery receipts for the week.',
        nowIso: '2026-02-11T09:00:00.000Z',
      },
      store
    );

    const result = retrieveKnowledge(
      {
        userId,
        query: 'How should benchmark regressions be tracked weekly?',
        topK: 3,
        nowIso: '2026-02-16T09:00:00.000Z',
      },
      store
    );

    expect(result.hits.length).toBeGreaterThan(0);
    expect(result.formula).toContain('semantic');
    expect(result.hits[0].source.title).toContain('benchmark');
    expect(result.hits[0].score).toBeGreaterThan(result.hits[result.hits.length - 1].score);
  });
});
