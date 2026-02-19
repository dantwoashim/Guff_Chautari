import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
  embedContentMock: vi.fn(),
  generateContentMock: vi.fn(),
  runWithFallbackMock: vi.fn(
    async (_tier: string, operation: (model: string) => Promise<any>) => operation('mock-model')
  ),
}));

const { fromMock, rpcMock, embedContentMock, generateContentMock, runWithFallbackMock } = mocks;

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: mocks.fromMock,
    rpc: mocks.rpcMock,
  },
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = {
      embedContent: mocks.embedContentMock,
      generateContent: mocks.generateContentMock,
    };
  },
}));

vi.mock('../modelManager', () => ({
  modelManager: {
    runWithFallback: mocks.runWithFallbackMock,
  },
}));

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'uuid-cluster'),
}));

import * as memoryService from '../memoryService';

type QueryResult = { data?: any; error?: any };

const createBuilder = (result: QueryResult = { data: null, error: null }) => {
  const builder: any = {};
  builder.select = vi.fn(() => builder);
  builder.insert = vi.fn(() => builder);
  builder.update = vi.fn(() => builder);
  builder.delete = vi.fn(() => builder);
  builder.upsert = vi.fn().mockResolvedValue(result);
  builder.eq = vi.fn(() => builder);
  builder.gte = vi.fn(() => builder);
  builder.gt = vi.fn(() => builder);
  builder.lte = vi.fn(() => builder);
  builder.order = vi.fn(() => builder);
  builder.limit = vi.fn(() => builder);
  builder.in = vi.fn(() => builder);
  builder.single = vi.fn().mockResolvedValue(result);
  builder.then = (onFulfilled: (value: QueryResult) => any, onRejected: (reason: unknown) => any) =>
    Promise.resolve(result).then(onFulfilled, onRejected);
  return builder;
};

const makeMemoryRow = (id: string, overrides: Record<string, any> = {}) => ({
  id,
  user_id: overrides.user_id ?? 'user-1',
  type: overrides.type ?? 'episodic',
  content: overrides.content ?? `memory-${id}`,
  embedding: overrides.embedding ?? [1, 0, 0],
  created_at: overrides.created_at ?? '2026-01-01T00:00:00.000Z',
  decay_factor: overrides.decay_factor ?? 1,
  connections: overrides.connections ?? [],
  emotional_valence: overrides.emotional_valence ?? 0.2,
  metadata: overrides.metadata ?? {},
  timestamp: overrides.timestamp ?? Date.now(),
});

describe('memoryService (coverage)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    runWithFallbackMock.mockImplementation(
      async (_tier: string, operation: (model: string) => Promise<any>) => operation('mock-model')
    );
    embedContentMock.mockResolvedValue({
      embeddings: [{ values: [1, 0, 0] }],
    });
    generateContentMock.mockResolvedValue({ text: 'YES' });
  });

  it('reranks semantic tier memories using embedding similarity', async () => {
    const builder = createBuilder({
      data: [
        { ...makeMemoryRow('good'), embedding: [1, 0, 0] },
        { ...makeMemoryRow('bad'), embedding: [0, 1, 0] },
      ],
      error: null,
    });
    fromMock.mockReturnValue(builder);

    const result = await memoryService.getMemoriesByTier('user-1', 'long_term', 'topic', 1);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('good');
    expect(builder.limit).toHaveBeenCalledWith(2);
  });

  it('returns empty memories when DB query fails', async () => {
    fromMock.mockReturnValue(createBuilder({ data: null, error: new Error('db') }));
    const result = await memoryService.getMemoriesByTier('user-1', 'working');
    expect(result).toEqual([]);
  });

  it('generates embeddings and throws when no vector is returned', async () => {
    const ok = await memoryService.generateEmbedding('hello');
    expect(ok).toEqual([1, 0, 0]);

    embedContentMock.mockResolvedValueOnce({ embeddings: [{}] });
    await expect(memoryService.generateEmbedding('broken')).rejects.toThrow('No embedding returned');
  });

  it('creates memory rows and maps DB shape to runtime shape', async () => {
    const insertBuilder = createBuilder({
      data: makeMemoryRow('created', {
        type: 'semantic',
        content: 'likes tea',
        embedding: [0.1, 0.2],
        decay_factor: 0.9,
        emotional_valence: 0.7,
      }),
      error: null,
    });
    fromMock.mockReturnValue(insertBuilder);

    const result = await memoryService.createMemory('user-1', 'likes tea', 'semantic', { source: 'test' }, 0.7);
    expect(result?.id).toBe('created');
    expect(insertBuilder.insert).toHaveBeenCalled();

    const failBuilder = createBuilder({ data: null, error: new Error('insert failed') });
    fromMock.mockReturnValue(failBuilder);
    const failed = await memoryService.createMemory('user-1', 'x', 'episodic');
    expect(failed).toBeNull();
  });

  it('stores, deletes, and updates memory records', async () => {
    const upsertBuilder = createBuilder({ data: null, error: null });
    const deleteBuilder = createBuilder({ data: null, error: null });
    const updateBuilder = createBuilder({ data: null, error: null });
    fromMock.mockReturnValueOnce(upsertBuilder).mockReturnValueOnce(deleteBuilder).mockReturnValueOnce(updateBuilder);

    await memoryService.storeMemory(
      {
        id: 'm-1',
        content: 'memory',
        type: 'episodic',
        embedding: [1],
        timestamp: Date.now(),
        decayFactor: 1,
        connections: [],
        emotionalValence: 0,
        metadata: {},
      },
      'user-1'
    );
    await memoryService.deleteMemory('m-1');
    await memoryService.updateMemoryDecay('m-1', 0.5);

    expect(upsertBuilder.upsert).toHaveBeenCalled();
    expect(deleteBuilder.delete).toHaveBeenCalled();
    expect(updateBuilder.update).toHaveBeenCalledWith({ decay_factor: 0.5 });
  });

  it('searches memories through RPC and falls back to recent fetch when RPC fails', async () => {
    rpcMock.mockResolvedValueOnce({
      data: [makeMemoryRow('rpc-hit', { type: 'semantic' })],
      error: null,
    });

    const hit = await memoryService.searchMemories('user-1', 'query', undefined, 2);
    expect(hit).toHaveLength(1);
    expect(hit[0].id).toBe('rpc-hit');

    rpcMock.mockResolvedValueOnce({ data: null, error: new Error('rpc failed') });
    const fallbackBuilder = createBuilder({
      data: [makeMemoryRow('recent-fallback', { type: 'semantic' })],
      error: null,
    });
    fromMock.mockReturnValue(fallbackBuilder);

    const fallback = await memoryService.searchMemories('user-1', 'query', 'semantic', 2);
    expect(fallback[0].id).toBe('recent-fallback');
    expect(fallbackBuilder.order).toHaveBeenCalled();
  });

  it('loads related and recent memories', async () => {
    fromMock.mockReturnValueOnce(createBuilder({ data: { connections: [] }, error: null }));
    const none = await memoryService.getRelatedMemories('m-none');
    expect(none).toEqual([]);

    fromMock
      .mockReturnValueOnce(createBuilder({ data: { connections: ['m-2'] }, error: null }))
      .mockReturnValueOnce(createBuilder({ data: [makeMemoryRow('m-2')], error: null }));
    const related = await memoryService.getRelatedMemories('m-1');
    expect(related[0].id).toBe('m-2');

    const recentBuilder = createBuilder({ data: [makeMemoryRow('m-recent', { type: 'episodic' })], error: null });
    fromMock.mockReturnValue(recentBuilder);
    const recent = await memoryService.getRecentMemories('user-1', 'episodic', 6);
    expect(recent).toHaveLength(1);
    expect(recentBuilder.eq).toHaveBeenCalledWith('type', 'episodic');
  });

  it('extracts memories from conversation and handles invalid JSON output', async () => {
    generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify([
        { content: 'user likes tea', type: 'semantic', emotionalValence: 0.3 },
      ]),
    });

    const insertBuilder = createBuilder({
      data: makeMemoryRow('m-ext', {
        content: 'user likes tea',
        type: 'semantic',
        emotional_valence: 0.3,
      }),
      error: null,
    });
    fromMock.mockReturnValue(insertBuilder);

    const extracted = await memoryService.extractMemoryFromConversation('user-1', [
      { id: '1', role: 'user', text: 'I love tea', timestamp: Date.now() },
      { id: '2', role: 'model', text: 'noted', timestamp: Date.now() },
    ]);
    expect(extracted).toHaveLength(1);

    generateContentMock.mockResolvedValueOnce({ text: 'not-json' });
    const invalid = await memoryService.extractMemoryFromConversation('user-1', [
      { id: '3', role: 'user', text: 'x', timestamp: Date.now() },
    ]);
    expect(invalid).toEqual([]);
  });

  it('connects memories and formats relevant context + graph', async () => {
    const updateA = createBuilder({ data: null, error: null });
    const updateB = createBuilder({ data: null, error: null });
    fromMock
      .mockReturnValueOnce(createBuilder({ data: { connections: [] }, error: null }))
      .mockReturnValueOnce(createBuilder({ data: { connections: [] }, error: null }))
      .mockReturnValueOnce(updateA)
      .mockReturnValueOnce(updateB);

    await memoryService.connectMemories('m-a', 'm-b');
    expect(updateA.update).toHaveBeenCalled();
    expect(updateB.update).toHaveBeenCalled();

    rpcMock.mockResolvedValueOnce({
      data: [makeMemoryRow('ctx-1', { type: 'semantic', content: 'likes tea' })],
      error: null,
    });
    const context = await memoryService.getRelevantContext('user-1', 'tea');
    expect(context).toContain('LONG_TERM_MEMORY_RECALL');

    fromMock
      .mockReturnValueOnce(createBuilder({ data: { connections: ['ctx-1'] }, error: null }))
      .mockReturnValueOnce(createBuilder({ data: [makeMemoryRow('ctx-1')], error: null }));
    const graph = await memoryService.getMemoryGraph('root-1');
    expect(graph?.id).toBe('uuid-cluster');
    expect(graph?.memoryIds).toEqual(['ctx-1']);
  });

  it('infers new memory connections and writes graph edges', async () => {
    rpcMock.mockResolvedValueOnce({
      data: [makeMemoryRow('candidate-1', { content: 'similar memory' })],
      error: null,
    });
    generateContentMock.mockResolvedValueOnce({ text: 'YES' });

    const updateA = createBuilder({ data: null, error: null });
    const updateB = createBuilder({ data: null, error: null });
    const edgeInsert = createBuilder({ data: null, error: null });

    fromMock
      .mockReturnValueOnce(
        createBuilder({
          data: makeMemoryRow('source-1', {
            id: 'source-1',
            user_id: 'user-1',
            content: 'source memory',
            connections: [],
          }),
          error: null,
        })
      )
      .mockReturnValueOnce(createBuilder({ data: { connections: [] }, error: null }))
      .mockReturnValueOnce(createBuilder({ data: { connections: [] }, error: null }))
      .mockReturnValueOnce(updateA)
      .mockReturnValueOnce(updateB)
      .mockReturnValueOnce(edgeInsert);

    const ids = await memoryService.inferConnections('source-1');
    expect(ids).toEqual(['candidate-1']);
    expect(edgeInsert.insert).toHaveBeenCalled();
  });

  it('consolidates highly similar memories and removes duplicates', async () => {
    const baseTime = Date.now();
    const memA = makeMemoryRow('m-a', {
      embedding: [1, 0, 0],
      metadata: { merged_count: 0 },
      created_at: new Date(baseTime).toISOString(),
    });
    const memB = makeMemoryRow('m-b', {
      embedding: [0.99, 0.01, 0],
      created_at: new Date(baseTime - 1000).toISOString(),
    });

    const updateBuilder = createBuilder({ data: null, error: null });
    const deleteBuilder = createBuilder({ data: null, error: null });
    fromMock
      .mockReturnValueOnce(createBuilder({ data: [memA, memB], error: null }))
      .mockReturnValueOnce(updateBuilder)
      .mockReturnValueOnce(deleteBuilder);

    await memoryService.consolidateMemories('user-1');
    expect(updateBuilder.update).toHaveBeenCalled();
    expect(deleteBuilder.delete).toHaveBeenCalled();
  });

  it('fetches memories by emotion and builds temporal context summaries', async () => {
    fromMock.mockReturnValueOnce(
      createBuilder({
        data: [makeMemoryRow('emo-1', { emotional_valence: 0.4 })],
        error: null,
      })
    );
    const emotional = await memoryService.getMemoriesByEmotion('user-1', 0.4, 0.1);
    expect(emotional).toHaveLength(1);

    fromMock.mockReturnValueOnce(createBuilder({ data: null, error: new Error('bad') }));
    const emotionalFail = await memoryService.getMemoriesByEmotion('user-1', 0.4, 0.1);
    expect(emotionalFail).toEqual([]);

    fromMock.mockReturnValueOnce(
      createBuilder({
        data: [
          { content: 'started gym', created_at: '2026-01-01T00:00:00.000Z' },
          { content: 'felt better', created_at: '2026-01-02T00:00:00.000Z' },
        ],
        error: null,
      })
    );
    generateContentMock.mockResolvedValueOnce({
      text: 'Over the last few days, progress improved.',
    });
    const summary = await memoryService.buildTemporalContext('user-1', 'session-1');
    expect(summary).toContain('Over the last few days');

    fromMock.mockReturnValueOnce(createBuilder({ data: [], error: null }));
    const emptySummary = await memoryService.buildTemporalContext('user-1', 'session-1');
    expect(emptySummary).toBe('');

    fromMock.mockReturnValueOnce(
      createBuilder({
        data: [{ content: 'x', created_at: '2026-01-01T00:00:00.000Z' }],
        error: null,
      })
    );
    runWithFallbackMock.mockRejectedValueOnce(new Error('generation fail'));
    const failedSummary = await memoryService.buildTemporalContext('user-1', 'session-1');
    expect(failedSummary).toBe('');
  });
});
