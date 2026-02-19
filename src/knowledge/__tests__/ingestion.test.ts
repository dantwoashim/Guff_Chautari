import { describe, expect, it } from 'vitest';
import {
  ingestKnowledgeFile,
  ingestKnowledgeNote,
  ingestKnowledgeUrl,
  KnowledgeGraphStore,
  createInMemoryKnowledgeStoreAdapter,
} from '../index';

describe('knowledge ingestion', () => {
  it('ingests note, file, and url sources with chunked nodes', () => {
    const store = new KnowledgeGraphStore(createInMemoryKnowledgeStoreAdapter());
    const userId = 'user-knowledge-ingestion';

    const noteResult = ingestKnowledgeNote(
      {
        userId,
        title: 'Weekly priorities',
        text: 'Launch the benchmark dashboard this week. Keep scope tight and prioritize measurable outcomes.',
      },
      store
    );

    const fileResult = ingestKnowledgeFile(
      {
        userId,
        title: 'research.txt',
        text: 'Customer interviews show that onboarding friction happens in the first five minutes. ' +
          'Users want clear setup instructions and fewer modal interruptions.',
        mimeType: 'text/plain',
        sizeBytes: 420,
      },
      store
    );

    const urlResult = ingestKnowledgeUrl(
      {
        userId,
        title: 'ashim-launch-post',
        url: 'https://example.com/post',
        text: 'Public launch notes: focus on reliability, quality gates, and predictable weekly shipping cadence.',
      },
      store
    );

    expect(noteResult.source.type).toBe('note');
    expect(fileResult.source.type).toBe('file');
    expect(urlResult.source.type).toBe('url');

    expect(noteResult.nodes.length).toBeGreaterThan(0);
    expect(fileResult.nodes.length).toBeGreaterThan(0);
    expect(urlResult.nodes.length).toBeGreaterThan(0);

    const state = store.load(userId);
    expect(state.sources.length).toBe(3);
    expect(state.nodes.length).toBeGreaterThanOrEqual(3);
  });
});
