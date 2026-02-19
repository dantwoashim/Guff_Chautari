import { describe, expect, it } from 'vitest';
import {
  ingestKnowledgeNote,
  retrieveKnowledge,
  synthesizeKnowledgeAnswer,
  KnowledgeGraphStore,
  createInMemoryKnowledgeStoreAdapter,
} from '../index';

describe('knowledge synthesis', () => {
  it('generates narrative answer with inline source citations', () => {
    const store = new KnowledgeGraphStore(createInMemoryKnowledgeStoreAdapter());
    const userId = 'user-knowledge-synthesis';

    ingestKnowledgeNote(
      {
        userId,
        title: 'Execution memo',
        text: 'Prioritize one measurable weekly objective, then define daily tasks and a Friday review checkpoint.',
      },
      store
    );

    ingestKnowledgeNote(
      {
        userId,
        title: 'Risk note',
        text: 'Track downside risks explicitly and document assumptions before committing to irreversible actions.',
      },
      store
    );

    const retrieval = retrieveKnowledge(
      {
        userId,
        query: 'How do I structure weekly execution with risk visibility?',
        topK: 4,
      },
      store
    );

    const synthesis = synthesizeKnowledgeAnswer(retrieval);

    expect(synthesis.citations.length).toBeGreaterThan(0);
    expect(synthesis.answer).toContain('[Source:');
    expect(synthesis.citations[0].marker).toMatch(/^\[Source: .+, chunk \d+\]$/);
  });
});
