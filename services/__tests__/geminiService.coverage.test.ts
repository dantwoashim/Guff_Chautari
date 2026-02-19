import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fromMock: vi.fn(),
  storageFromMock: vi.fn(),
  getRuntimeKeyMock: vi.fn(() => 'test-gemini-key'),
  recordRequestMock: vi.fn(),
  chatCreateMock: vi.fn(),
  generateContentStreamMock: vi.fn(),
  generateContentMock: vi.fn(),
  checkCacheMock: vi.fn(() => ({ skipAPI: false, response: null, pattern: null })),
  addImperfectionsMock: vi.fn((text: string) => text),
  getOrCreatePersonaCacheMock: vi.fn(),
  invalidatePersonaCacheMock: vi.fn(),
  getCacheNameMock: vi.fn(),
  hasActiveCacheMock: vi.fn(),
  splitPersonaMock: vi.fn(() => ({
    immutableCore: {
      name: 'Asha',
      identity: 'friendly',
      speechPattern: 'casual',
      vocabulary: [],
      absoluteRules: [],
    },
    mutableState: {
      currentMood: 'neutral',
      energyLevel: 0,
      socialBattery: 0,
      emotionalDebt: 0,
      recentEvents: [],
      relationshipStage: 'new',
    },
    sessionId: 'session-1',
  })),
  generateDifferentialPromptMock: vi.fn(() => '[DIFF]'),
  decomposePersonaMock: vi.fn(() => ({
    success: true,
    graph: { nodes: [] },
    stats: { totalSections: 1, totalTokens: 100, coreTokens: 50 },
  })),
  detectMessageContextMock: vi.fn(() => ({ topic: 'topic' })),
  compileContextualPromptMock: vi.fn(() => ({
    prompt: '[CPR]',
    nodesIncluded: 1,
    nodesAvailable: 1,
    totalTokens: 100,
  })),
  initializeStateMock: vi.fn(() => ({ id: 'state-1' })),
  generateHyperRealisticImageMock: vi.fn(async () => ({
    imageUrl: 'https://img.example/1.png',
    caption: 'caption',
    preText: 'pretxt',
  })),
  inferImageContextMock: vi.fn(() => ({
    mood: 'happy',
    timeOfDay: 'afternoon',
    location: 'room',
    lighting: 'natural',
  })),
  fetchReferenceImagesMock: vi.fn(async () => []),
  getTimeContextMock: vi.fn(() => ({
    period: 'afternoon',
    hour: 15,
    dayType: 'weekday',
    isWeekend: false,
  })),
  generateTimePromptMock: vi.fn(() => '[TIME]'),
  calculatePhysicalStateMock: vi.fn(() => ({ energy: 0.5 })),
  getPhysicalContextMock: vi.fn(() => '[PHYSICAL]'),
  sessionCacheGetMock: vi.fn(),
  sessionCacheSetMock: vi.fn(),
  sessionCacheInvalidateMock: vi.fn(),
  sessionCacheInvalidateByPersonaMock: vi.fn(),
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: mocks.fromMock,
    storage: {
      from: mocks.storageFromMock,
    },
  },
}));

vi.mock('../../src/byok/runtimeKey', () => ({
  getRuntimeGeminiKey: mocks.getRuntimeKeyMock,
}));

vi.mock('../../src/byok/usageStats', () => ({
  recordGeminiRequest: mocks.recordRequestMock,
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    chats = {
      create: mocks.chatCreateMock,
    };
    models = {
      generateContentStream: mocks.generateContentStreamMock,
      generateContent: mocks.generateContentMock,
    };
  },
  Chat: class {},
  Type: {
    OBJECT: 'OBJECT',
    STRING: 'STRING',
  },
  HarmBlockThreshold: {
    BLOCK_NONE: 'BLOCK_NONE',
  },
  HarmCategory: {
    HARM_CATEGORY_HATE_SPEECH: 'HATE',
    HARM_CATEGORY_SEXUALLY_EXPLICIT: 'SEX',
    HARM_CATEGORY_HARASSMENT: 'HARASS',
    HARM_CATEGORY_DANGEROUS_CONTENT: 'DANGER',
  },
  FunctionCallingConfigMode: {
    AUTO: 'AUTO',
  },
}));

vi.mock('../responseCache', () => ({
  checkCache: mocks.checkCacheMock,
}));

vi.mock('../imperfectionEngine', () => ({
  addImperfections: mocks.addImperfectionsMock,
  IMPERFECTION_PRESETS: {
    casual: {},
  },
}));

vi.mock('../imageGenService', () => ({
  generateHyperRealisticImage: mocks.generateHyperRealisticImageMock,
}));

vi.mock('../contextInference', () => ({
  inferImageContextFromConversation: mocks.inferImageContextMock,
}));

vi.mock('../adminService', () => ({
  fetchReferenceImages: mocks.fetchReferenceImagesMock,
}));

vi.mock('../timeContextService', () => ({
  getTimeContext: mocks.getTimeContextMock,
  generateTimePromptInjection: mocks.generateTimePromptMock,
}));

vi.mock('../physicalStateEngine', () => ({
  calculatePhysicalState: mocks.calculatePhysicalStateMock,
  getPhysicalContext: mocks.getPhysicalContextMock,
}));

vi.mock('../cognitiveArchitecture', () => ({
  splitPersonaIntoDifferential: mocks.splitPersonaMock,
  generateDifferentialPrompt: mocks.generateDifferentialPromptMock,
}));

vi.mock('../sessionCache', () => ({
  sessionCache: {
    get: mocks.sessionCacheGetMock,
    set: mocks.sessionCacheSetMock,
    invalidate: mocks.sessionCacheInvalidateMock,
    invalidateByPersona: mocks.sessionCacheInvalidateByPersonaMock,
  },
}));

vi.mock('../personaCache', () => ({
  getOrCreatePersonaCache: mocks.getOrCreatePersonaCacheMock,
  invalidatePersonaCache: mocks.invalidatePersonaCacheMock,
  getCacheName: mocks.getCacheNameMock,
  hasActiveCache: mocks.hasActiveCacheMock,
}));

vi.mock('../personaGraph', () => ({
  decomposePersona: mocks.decomposePersonaMock,
  detectMessageContext: mocks.detectMessageContextMock,
  compileContextualPrompt: mocks.compileContextualPromptMock,
  initializeState: mocks.initializeStateMock,
}));

import * as geminiService from '../geminiService';

const asyncChunks = async function* (chunks: any[]) {
  for (const chunk of chunks) {
    yield chunk;
  }
};

const createTableBuilder = (result: { data?: any; error?: any } = { data: null, error: null }) => {
  const builder: any = {};
  builder.select = vi.fn(() => builder);
  builder.insert = vi.fn(() => builder);
  builder.delete = vi.fn(() => builder);
  builder.update = vi.fn(() => builder);
  builder.or = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.order = vi.fn(() => builder);
  builder.single = vi.fn().mockResolvedValue(result);
  builder.then = (onFulfilled: (value: any) => any, onRejected: (reason: unknown) => any) =>
    Promise.resolve(result).then(onFulfilled, onRejected);
  return builder;
};

const createStorageBucket = (options?: {
  uploadError?: unknown;
  listData?: any[];
  listError?: unknown;
}) => {
  const uploadError = options?.uploadError ?? null;
  const listData = options?.listData ?? [];
  const listError = options?.listError ?? null;
  return {
    upload: vi.fn().mockResolvedValue({ error: uploadError }),
    list: vi.fn().mockResolvedValue({ data: listData, error: listError }),
    getPublicUrl: vi.fn((path: string) => ({
      data: { publicUrl: `https://cdn.example/${path}` },
    })),
  };
};

describe('geminiService (coverage)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getRuntimeKeyMock.mockReturnValue('test-gemini-key');
    mocks.checkCacheMock.mockReturnValue({ skipAPI: false, response: null, pattern: null });
    mocks.addImperfectionsMock.mockImplementation((text: string) => text);
    mocks.getOrCreatePersonaCacheMock.mockResolvedValue(null);
    mocks.chatCreateMock.mockResolvedValue({ id: 'chat-created' });
    mocks.generateContentStreamMock.mockReturnValue(asyncChunks([{ text: 'chunk' }]));
    mocks.generateContentMock.mockResolvedValue({ text: ' transcribed text ' });
    mocks.fromMock.mockImplementation(() => createTableBuilder({ data: [], error: null }));
    mocks.storageFromMock.mockImplementation(() => createStorageBucket());
  });

  it('creates chat sessions for baseline, differential, and CPR persona paths', async () => {
    await geminiService.createChatSession(
      {
        systemInstruction: 'BASE',
        model: 'gemini-3-pro-preview',
        thinkingBudget: 2,
        temperature: 0.5,
      },
      []
    );

    const basePayload = mocks.chatCreateMock.mock.calls[0][0];
    expect(basePayload.config.systemInstruction).toContain('BASE');
    expect(basePayload.config.systemInstruction).toContain('[TIME]');
    expect(basePayload.config.systemInstruction).toContain('[PHYSICAL]');

    const history = Array.from({ length: 16 }).map(() => ({ role: 'user', parts: [{ text: 'x' }] }));
    await geminiService.createChatSession(
      {
        model: 'gemini-3-pro-preview',
        livingPersona: {
          id: 'persona-1',
          compiledPrompt: 'Short persona prompt',
          core: { name: 'Asha' },
        } as any,
      },
      history
    );
    const diffPayload = mocks.chatCreateMock.mock.calls[1][0];
    expect(mocks.splitPersonaMock).toHaveBeenCalled();
    expect(mocks.generateDifferentialPromptMock).toHaveBeenCalled();
    expect(diffPayload.config.systemInstruction).toContain('[DIFF]');
    expect(diffPayload.config.systemInstruction).toContain('IDENTITY REMINDER');

    await geminiService.createChatSession(
      {
        model: 'gemini-3-pro-preview',
        livingPersona: {
          id: 'persona-long',
          compiledPrompt: 'x'.repeat(50001),
          core: { name: 'Asha' },
        } as any,
        lastUserMessage: 'hello',
      } as any,
      []
    );
    const cprPayload = mocks.chatCreateMock.mock.calls[2][0];
    expect(mocks.decomposePersonaMock).toHaveBeenCalled();
    expect(mocks.compileContextualPromptMock).toHaveBeenCalled();
    expect(cprPayload.config.systemInstruction).toContain('[CPR]');
  });

  it('creates sessions through router helpers and invalidates cache entries', async () => {
    const result = await geminiService.getOrCreateChatSession(
      'conv-1',
      { systemInstruction: 'x', model: 'gemini-3-pro-preview' },
      []
    );
    expect(result.fromCache).toBe(false);
    expect(result.chat).toEqual({ id: 'chat-created' });

    geminiService.invalidateChatSession('conv-1', 'persona-1');
    geminiService.invalidatePersonaSessions('persona-1');

    expect(mocks.sessionCacheInvalidateMock).toHaveBeenCalledWith('conv-1', 'persona-1');
    expect(mocks.sessionCacheInvalidateByPersonaMock).toHaveBeenCalledWith('persona-1');
  });

  it('generates with explicit cache and fallback paths', async () => {
    mocks.getOrCreatePersonaCacheMock.mockResolvedValueOnce('cache-1');
    mocks.generateContentStreamMock.mockReturnValueOnce(asyncChunks([{ text: 'A' }, { text: 'B' }]));

    const streamed: string[] = [];
    const cached = await geminiService.generateWithExplicitCache(
      {
        model: 'gemini-3-pro-preview',
        livingPersona: { id: 'p1', compiledPrompt: 'persona prompt' } as any,
      },
      [],
      'hello',
      (text) => streamed.push(text)
    );
    expect(cached.fromCache).toBe(true);
    expect(cached.text).toBe('AB');
    expect(cached.tokensSaved).toBeGreaterThan(0);
    expect(streamed).toEqual(['A', 'B']);

    mocks.getOrCreatePersonaCacheMock.mockResolvedValueOnce(null);
    mocks.generateContentStreamMock.mockReturnValueOnce(asyncChunks([{ text: 'Z' }]));

    const fallback = await geminiService.generateWithExplicitCache(
      {
        model: 'gemini-3-pro-preview',
        systemInstruction: 'persona fallback',
      },
      [],
      'hello'
    );
    expect(fallback.fromCache).toBe(false);
    expect(fallback.tokensSaved).toBe(0);
    expect(fallback.text).toBe('Z');
  });

  it('streams messages for cache-hit, text, tool-call, and abort scenarios', async () => {
    const onChunk = vi.fn();
    const onComplete = vi.fn(async () => {});

    mocks.checkCacheMock.mockReturnValueOnce({
      skipAPI: true,
      response: 'cached-response',
      pattern: 'cache-pattern',
    });

    const cacheChat = { sendMessageStream: vi.fn() } as any;
    await geminiService.sendMessageStream(
      cacheChat,
      'hello',
      [],
      onChunk,
      onComplete,
      { model: 'gemini-3-pro-preview' }
    );
    expect(onChunk).toHaveBeenCalledWith('cached-response');
    expect(onComplete).toHaveBeenCalled();
    expect(cacheChat.sendMessageStream).not.toHaveBeenCalled();

    const streamChat = {
      sendMessageStream: vi
        .fn()
        .mockResolvedValue(asyncChunks([{ text: 'hello generate_image {"prompt":"x"}' }])),
    } as any;
    const onChunk2 = vi.fn();
    const onComplete2 = vi.fn(async () => {});
    await geminiService.sendMessageStream(
      streamChat,
      'hi',
      [],
      onChunk2,
      onComplete2,
      { model: 'gemini-3-pro-preview' }
    );
    expect(onChunk2).toHaveBeenCalledWith('hello');
    expect(onComplete2).toHaveBeenCalled();

    const toolChat = {
      sendMessageStream: vi.fn().mockResolvedValue(
        asyncChunks([
          {
            candidates: [
              {
                content: {
                  parts: [{ functionCall: { name: 'generate_image', args: { prompt: 'selfie' } } }],
                },
              },
            ],
          },
        ])
      ),
    } as any;
    const onImageGenerated = vi.fn();
    const onImageGenerationStart = vi.fn();
    const onLogUpdate = vi.fn();
    const onComplete3 = vi.fn(async () => {});
    await geminiService.sendMessageStream(
      toolChat,
      'show me',
      [{ type: 'image', mimeType: 'image/png', data: 'abc', url: 'https://img' }],
      vi.fn(),
      onComplete3,
      { model: 'gemini-3-pro-preview' },
      undefined,
      onImageGenerated,
      onLogUpdate,
      onImageGenerationStart
    );
    expect(onImageGenerationStart).toHaveBeenCalled();
    expect(mocks.generateHyperRealisticImageMock).toHaveBeenCalled();
    expect(onImageGenerated).toHaveBeenCalled();
    expect(onComplete3).toHaveBeenCalled();

    const abortController = new AbortController();
    abortController.abort();
    const abortChat = {
      sendMessageStream: vi.fn().mockResolvedValue(asyncChunks([{ text: 'x' }])),
    } as any;
    await expect(
      geminiService.sendMessageStream(
        abortChat,
        'abort',
        [],
        vi.fn(),
        vi.fn(async () => {}),
        { model: 'gemini-3-pro-preview' },
        abortController.signal
      )
    ).resolves.toBeUndefined();
  });

  it('transcribes audio and handles transcription failure', async () => {
    const ok = await geminiService.transcribeAudio('BASE64', 'audio/wav');
    expect(ok).toBe('transcribed text');

    mocks.generateContentMock.mockRejectedValueOnce(new Error('failed'));
    const failed = await geminiService.transcribeAudio('BASE64', 'audio/wav');
    expect(failed).toBe('');
  });

  it('handles storage uploads and library listing', async () => {
    const goodBucket = createStorageBucket({
      listData: [{ name: 'f1.png', metadata: { mimetype: 'image/png' } }],
    });
    mocks.storageFromMock.mockReturnValueOnce(goodBucket).mockReturnValueOnce(goodBucket).mockReturnValueOnce(goodBucket);
    const url = await geminiService.uploadFileToStorage(
      { name: 'f1.png' } as File,
      'library',
      'user-1/f1.png',
      'user-1'
    );
    expect(url).toBe('https://cdn.example/user-1/f1.png');

    const files = await geminiService.fetchLibraryFiles('library', 'user-1');
    expect(files[0].mimeType).toBe('image/png');
    expect(files[0].url).toContain('user-1/f1.png');

    const badBucket = createStorageBucket({ uploadError: new Error('upload failed'), listError: new Error('list failed') });
    mocks.storageFromMock.mockReturnValueOnce(badBucket).mockReturnValueOnce(badBucket);
    const badUpload = await geminiService.uploadFileToStorage(
      { name: 'x.png' } as File,
      'library',
      'user-1/x.png',
      'user-1'
    );
    expect(badUpload).toBeNull();
    const badList = await geminiService.fetchLibraryFiles('library', 'user-1');
    expect(badList).toEqual([]);
  });

  it('handles preset/persona CRUD and utility helpers', async () => {
    const presetsBuilder = createTableBuilder({
      data: [{ id: 'p1', user_id: 'u1', name: 'n', content: 'c' }],
      error: null,
    });
    const saveBuilder = createTableBuilder({
      data: { id: 'p2', user_id: 'u1', name: 'n2', content: 'c2' },
      error: null,
    });
    const deleteBuilder = createTableBuilder({ data: null, error: null });
    const personasBuilder = createTableBuilder({
      data: [{ id: 'per1', user_id: 'u1', name: 'A', description: '', system_instruction: '' }],
      error: null,
    });
    const createPersonaBuilder = createTableBuilder({
      data: { id: 'per2', user_id: 'u1', name: 'B', description: '', system_instruction: '' },
      error: null,
    });
    const deletePersonaBuilder = createTableBuilder({ data: null, error: null });
    const failedPersonaFetchBuilder = createTableBuilder({ data: null, error: new Error('bad fetch') });

    mocks.fromMock
      .mockReturnValueOnce(presetsBuilder)
      .mockReturnValueOnce(saveBuilder)
      .mockReturnValueOnce(deleteBuilder)
      .mockReturnValueOnce(personasBuilder)
      .mockReturnValueOnce(createPersonaBuilder)
      .mockReturnValueOnce(deletePersonaBuilder)
      .mockReturnValueOnce(failedPersonaFetchBuilder);

    const presets = await geminiService.fetchPresets('u1');
    expect(presets).toHaveLength(1);

    const saved = await geminiService.savePreset('u1', 'name', 'content');
    expect(saved?.id).toBe('p2');

    await geminiService.deletePreset('p2');
    expect(deleteBuilder.delete).toHaveBeenCalled();

    const personas = await geminiService.fetchPersonas('u1');
    expect(personas).toHaveLength(1);

    const created = await geminiService.createPersona('u1', 'Name', 'instruction', 'desc', 'avatar');
    expect(created?.id).toBe('per2');

    await geminiService.deletePersona('per2');
    expect(deletePersonaBuilder.delete).toHaveBeenCalled();

    const failedPersonas = await geminiService.fetchPersonas('u1');
    expect(failedPersonas).toEqual([]);

    const voice = await geminiService.analyzeVoiceCharacteristics([]);
    expect(voice.timbre).toContain('Warm');

    const cloned = await geminiService.generateClonedSpeech('hello', 'profile');
    expect(cloned).toBe('');

    const ctx = {
      createBuffer: vi.fn(() => ({ id: 'buffer' })),
    } as any;
    const audioBuffer = await geminiService.createAudioBufferFromPCM('PCM', ctx);
    expect(audioBuffer).toEqual({ id: 'buffer' });

    const compared = await geminiService.compareVoices([], {});
    expect(compared.score).toBe(95);
  });
});
