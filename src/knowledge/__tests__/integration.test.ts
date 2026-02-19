import { describe, expect, it } from 'vitest';
import {
  ingestKnowledgeNote,
  retrieveKnowledge,
  synthesizeKnowledgeAnswer,
  KnowledgeGraphStore,
  createInMemoryKnowledgeStoreAdapter,
} from '../index';

describe('knowledge integration benchmark', () => {
  it('meets retrieval and citation quality thresholds on controlled dataset', () => {
    const store = new KnowledgeGraphStore(createInMemoryKnowledgeStoreAdapter());
    const userId = 'user-knowledge-benchmark';

    const sourceByTopic = new Map<string, string>();

    for (let index = 1; index <= 20; index += 1) {
      const topic = `anchorword${index.toString().padStart(2, '0')}zeta`;
      const source = ingestKnowledgeNote(
        {
          userId,
          title: `Doc ${topic}`,
          text:
            `${topic} discusses strategy ${index}. ` +
            `Core guidance: execute ${topic} with explicit assumptions, measurable outcomes, and review cadence. ` +
            `The operating keyword for this document is ${topic}.`,
          nowIso: `2026-01-${String((index % 28) + 1).padStart(2, '0')}T10:00:00.000Z`,
        },
        store
      ).source;
      sourceByTopic.set(topic, source.id);
    }

    const evaluationTopics = Array.from(
      { length: 10 },
      (_, idx) => `anchorword${String(idx + 1).padStart(2, '0')}zeta`
    );

    let retrievalCorrect = 0;
    let citationCorrect = 0;

    for (const topic of evaluationTopics) {
      const retrieval = retrieveKnowledge(
        {
          userId,
          query: `Summarize ${topic} execution guidance`,
          topK: 5,
          nowIso: '2026-02-16T12:00:00.000Z',
        },
        store
      );

      const expectedSourceId = sourceByTopic.get(topic);
      if (!expectedSourceId) continue;

      if (retrieval.hits[0]?.source.id === expectedSourceId) {
        retrievalCorrect += 1;
      }

      const synthesis = synthesizeKnowledgeAnswer(retrieval);
      if (synthesis.citations.some((citation) => citation.sourceId === expectedSourceId)) {
        citationCorrect += 1;
      }
    }

    const retrievalAccuracy = retrievalCorrect / evaluationTopics.length;
    const citationAccuracy = citationCorrect / evaluationTopics.length;

    expect(retrievalAccuracy).toBeGreaterThanOrEqual(0.6);
    expect(citationAccuracy).toBeGreaterThanOrEqual(0.7);
  });
});
