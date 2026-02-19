import { describe, expect, it } from 'vitest';
import { GeminiContextCache } from '../gemini/geminiCache';
import { MockProvider } from '../mock/mockProvider';
import { ModelRouter, ModelRouterError } from '../router';
import type {
  EmbedRequest,
  EmbedResponse,
  ModelProvider,
  ProviderStreamChunk,
  ProviderValidationResult,
  StreamChatRequest,
} from '../types';

const makeLookup = (providers: ModelProvider[]) => {
  const map = new Map(providers.map((provider) => [provider.id, provider]));
  return {
    resolve(providerId: string): ModelProvider {
      const provider = map.get(providerId);
      if (!provider) {
        throw new Error(`unknown provider: ${providerId}`);
      }
      return provider;
    },
    list(): string[] {
      return [...map.keys()];
    },
  };
};

const makeInlineProvider = (options: {
  id: string;
  validate?: (apiKey: string) => Promise<ProviderValidationResult>;
  stream?: (request: StreamChatRequest) => AsyncIterable<ProviderStreamChunk>;
  embed?: (request: EmbedRequest) => Promise<EmbedResponse>;
}): ModelProvider => {
  return {
    id: options.id,
    validateKey: options.validate ?? (async () => ({ ok: true, status: 'healthy' })),
    streamChat:
      options.stream ??
      (async function* () {
        yield { text: 'inline-stream' };
      }),
    embed:
      options.embed ??
      (async (request) => ({
        model: request.model,
        vectors: [[0.1, 0.2, 0.3]],
        dimensions: 3,
      })),
  };
};

describe('ModelRouter', () => {
  it('routes by task class to the configured provider/model', async () => {
    const chatProvider = new MockProvider({ id: 'chat-primary' });
    const embedProvider = new MockProvider({ id: 'embed-primary' });
    const multimodalProvider = new MockProvider({ id: 'multi-primary' });

    const router = new ModelRouter({
      providerLookup: makeLookup([chatProvider, embedProvider, multimodalProvider]),
      defaultProviderOrder: {
        chat: ['chat-primary'],
        embedding: ['embed-primary'],
        multimodal: ['multi-primary'],
      },
      defaultModels: {
        'chat-primary': { chat: 'chat-model-v1' },
        'embed-primary': { embedding: 'embed-model-v1' },
        'multi-primary': { multimodal: 'vision-model-v1' },
      },
    });

    const chatRoute = await router.resolveTaskRoute({ task: 'chat' });
    const embeddingRoute = await router.resolveTaskRoute({ task: 'embedding' });
    const multimodalRoute = await router.resolveTaskRoute({ task: 'multimodal' });

    expect(chatRoute.providerId).toBe('chat-primary');
    expect(chatRoute.model).toBe('chat-model-v1');
    expect(embeddingRoute.providerId).toBe('embed-primary');
    expect(embeddingRoute.model).toBe('embed-model-v1');
    expect(multimodalRoute.providerId).toBe('multi-primary');
    expect(multimodalRoute.model).toBe('vision-model-v1');
  });

  it('falls back on quota-exceeded key health and uses next provider', async () => {
    const quotaProvider = new MockProvider({
      id: 'quota-primary',
      failureModes: { validateKey: 'quota' },
    });

    const fallbackProvider = new MockProvider({
      id: 'fallback-provider',
      responseByPrompt: {
        'hello router': 'fallback says hello',
      },
    });

    const router = new ModelRouter({
      providerLookup: makeLookup([quotaProvider, fallbackProvider]),
      defaultProviderOrder: {
        chat: ['quota-primary', 'fallback-provider'],
        embedding: ['fallback-provider'],
        multimodal: ['fallback-provider'],
      },
      defaultModels: {
        'quota-primary': { chat: 'chat-a' },
        'fallback-provider': { chat: 'chat-b' },
      },
    });

    const result = await router.streamChat({
      messages: [{ role: 'user', content: 'hello router' }],
      apiKey: 'test-key',
      allowFallback: true,
    });

    expect(result.providerId).toBe('fallback-provider');
    expect(result.usedFallback).toBe(true);
    expect(result.text).toContain('fallback says hello');
  });

  it('treats auth failure as terminal (no fallback)', async () => {
    const authProvider = new MockProvider({
      id: 'auth-primary',
      failureModes: { validateKey: 'auth' },
    });

    const fallbackProvider = new MockProvider({ id: 'fallback-provider' });

    const router = new ModelRouter({
      providerLookup: makeLookup([authProvider, fallbackProvider]),
      defaultProviderOrder: {
        chat: ['auth-primary', 'fallback-provider'],
        embedding: ['fallback-provider'],
        multimodal: ['fallback-provider'],
      },
    });

    await expect(
      router.streamChat({
        messages: [{ role: 'user', content: 'hello' }],
        apiKey: 'bad-key',
        allowFallback: true,
      })
    ).rejects.toMatchObject({
      name: 'ModelRouterError',
      classification: 'auth_error',
      providerId: 'auth-primary',
    } as Partial<ModelRouterError>);
  });

  it('classifies quota and auth errors differently', () => {
    const router = new ModelRouter({
      providerLookup: makeLookup([new MockProvider({ id: 'mock' })]),
      defaultProviderOrder: {
        chat: ['mock'],
        embedding: ['mock'],
        multimodal: ['mock'],
      },
    });

    expect(router.classifyFailure(new Error('429 quota exceeded'))).toBe('quota_error');
    expect(router.classifyFailure(new Error('401 auth failed'))).toBe('auth_error');
    expect(router.classifyFailure(new Error('rate limit reached'))).toBe('rate_limited');
    expect(router.classifyFailure(new Error('network timeout'))).toBe('network_error');
    expect(router.classifyFailure(new Error('provider internal crash'))).toBe('provider_error');
    expect(router.classifyFailure(new Error('strange output'))).toBe('unknown');
  });

  it('creates immutable-core cache on first route and reuses cache id on subsequent route', async () => {
    const geminiMock = new MockProvider({ id: 'gemini' });
    const cache = new GeminiContextCache({
      now: (() => {
        let tick = 1;
        return () => tick++;
      })(),
    });

    const router = new ModelRouter({
      providerLookup: makeLookup([geminiMock]),
      defaultProviderOrder: {
        chat: ['gemini'],
        embedding: ['gemini'],
        multimodal: ['gemini'],
      },
      cache,
    });

    const first = await router.resolveTaskRoute({
      task: 'chat',
      personaId: 'persona-1',
      sessionId: 'session-1',
      immutableCore: 'core persona instructions go here',
    });

    const second = await router.resolveTaskRoute({
      task: 'chat',
      personaId: 'persona-1',
      sessionId: 'session-1',
      immutableCore: 'core persona instructions go here',
    });

    expect(first.cacheId).toBeDefined();
    expect(first.cacheReused).toBe(false);
    expect(second.cacheId).toBe(first.cacheId);
    expect(second.cacheReused).toBe(true);
  });

  it('does not fallback when quota health error occurs on last available provider', async () => {
    const quotaProvider = new MockProvider({
      id: 'quota-only',
      failureModes: { validateKey: 'quota' },
    });

    const router = new ModelRouter({
      providerLookup: makeLookup([quotaProvider]),
      defaultProviderOrder: {
        chat: ['quota-only'],
        embedding: ['quota-only'],
        multimodal: ['quota-only'],
      },
    });

    await expect(
      router.streamChat({
        messages: [{ role: 'user', content: 'hello' }],
        apiKey: 'test-key',
      })
    ).rejects.toMatchObject({
      classification: 'quota_error',
      providerId: 'quota-only',
    } as Partial<ModelRouterError>);
  });

  it('falls back when stream returns rate-limited error', async () => {
    const rateLimitedProvider = makeInlineProvider({
      id: 'rate-limited',
      stream: async function* () {
        throw new Error('rate limit reached');
      },
    });

    const fallbackProvider = new MockProvider({
      id: 'fallback-ok',
      responseByPrompt: {
        test: 'fallback response',
      },
    });

    const router = new ModelRouter({
      providerLookup: makeLookup([rateLimitedProvider, fallbackProvider]),
      defaultProviderOrder: {
        chat: ['rate-limited', 'fallback-ok'],
        embedding: ['fallback-ok'],
        multimodal: ['fallback-ok'],
      },
    });

    const result = await router.streamChat({
      messages: [{ role: 'user', content: 'test' }],
      allowFallback: true,
    });

    expect(result.providerId).toBe('fallback-ok');
    expect(result.usedFallback).toBe(true);
  });

  it('treats stream-time auth error as terminal', async () => {
    const authStreamProvider = new MockProvider({
      id: 'auth-stream',
      failureModes: { streamChat: 'auth' },
    });

    const fallbackProvider = new MockProvider({ id: 'fallback' });

    const router = new ModelRouter({
      providerLookup: makeLookup([authStreamProvider, fallbackProvider]),
      defaultProviderOrder: {
        chat: ['auth-stream', 'fallback'],
        embedding: ['fallback'],
        multimodal: ['fallback'],
      },
    });

    await expect(
      router.streamChat({
        messages: [{ role: 'user', content: 'test' }],
        allowFallback: true,
      })
    ).rejects.toMatchObject({
      classification: 'auth_error',
      providerId: 'auth-stream',
    } as Partial<ModelRouterError>);
  });

  it('uses generic default models when provider has no explicit model map', async () => {
    const customProvider = new MockProvider({ id: 'custom' });

    const router = new ModelRouter({
      providerLookup: makeLookup([customProvider]),
      defaultProviderOrder: {
        chat: ['custom'],
        embedding: ['custom'],
        multimodal: ['custom'],
      },
    });

    const chatRoute = await router.resolveTaskRoute({ task: 'chat' });
    const embeddingRoute = await router.resolveTaskRoute({ task: 'embedding' });
    const multimodalRoute = await router.resolveTaskRoute({ task: 'multimodal' });

    expect(chatRoute.model).toBe('model-chat');
    expect(embeddingRoute.model).toBe('model-embedding');
    expect(multimodalRoute.model).toBe('model-multimodal');
  });

  it('ignores unknown preferred provider and continues with ordered provider list', async () => {
    const provider = new MockProvider({ id: 'primary' });
    const router = new ModelRouter({
      providerLookup: makeLookup([provider]),
      defaultProviderOrder: {
        chat: ['primary'],
        embedding: ['primary'],
        multimodal: ['primary'],
      },
    });

    const route = await router.resolveTaskRoute({
      task: 'chat',
      preferredProviderId: 'not-real',
    });

    expect(route.providerId).toBe('primary');
  });

  it('honors known preferred provider by prioritizing it over default order', async () => {
    const primary = new MockProvider({ id: 'primary' });
    const secondary = new MockProvider({ id: 'secondary' });
    const router = new ModelRouter({
      providerLookup: makeLookup([primary, secondary]),
      defaultProviderOrder: {
        chat: ['primary', 'secondary'],
        embedding: ['primary'],
        multimodal: ['primary'],
      },
      defaultModels: {
        secondary: { chat: 'secondary-chat' },
      },
    });

    const route = await router.resolveTaskRoute({
      task: 'chat',
      preferredProviderId: 'secondary',
    });

    expect(route.providerId).toBe('secondary');
    expect(route.model).toBe('secondary-chat');
  });

  it('returns explicit unknown-route errors when no providers are available', async () => {
    const emptyLookup = {
      resolve(): ModelProvider {
        throw new Error('no providers');
      },
      list(): string[] {
        return [];
      },
    };

    const router = new ModelRouter({
      providerLookup: emptyLookup,
      defaultProviderOrder: {
        chat: ['missing'],
        embedding: ['missing'],
        multimodal: ['missing'],
      },
    });

    await expect(router.resolveTaskRoute({ task: 'chat' })).rejects.toMatchObject({
      classification: 'unknown',
    } as Partial<ModelRouterError>);

    await expect(
      router.streamChat({
        messages: [{ role: 'user', content: 'hello' }],
      })
    ).rejects.toMatchObject({
      classification: 'unknown',
    } as Partial<ModelRouterError>);
  });

  it('classifies invalid validation with quota_exceeded code as quota error', async () => {
    const quotaInvalidProvider = makeInlineProvider({
      id: 'quota-invalid',
      validate: async () => ({
        ok: false,
        status: 'invalid',
        errorCode: 'quota_exceeded',
        errorMessage: 'over quota',
      }),
    });

    const fallbackProvider = new MockProvider({ id: 'fallback-ok' });
    const router = new ModelRouter({
      providerLookup: makeLookup([quotaInvalidProvider, fallbackProvider]),
      defaultProviderOrder: {
        chat: ['quota-invalid', 'fallback-ok'],
        embedding: ['fallback-ok'],
        multimodal: ['fallback-ok'],
      },
    });

    const route = await router.resolveTaskRoute({
      task: 'chat',
      apiKey: 'test-key',
      allowFallback: true,
    });

    expect(route.providerId).toBe('fallback-ok');
    expect(route.usedFallback).toBe(true);
  });

  it('creates and reuses gemini cache ids during stream routing', async () => {
    const gemini = new MockProvider({
      id: 'gemini',
      responseByPrompt: {
        hello: 'hello from gemini cache flow',
      },
    });

    const cache = new GeminiContextCache({
      now: (() => {
        let tick = 1000;
        return () => tick++;
      })(),
    });

    const router = new ModelRouter({
      providerLookup: makeLookup([gemini]),
      defaultProviderOrder: {
        chat: ['gemini'],
        embedding: ['gemini'],
        multimodal: ['gemini'],
      },
      cache,
    });

    const first = await router.streamChat({
      messages: [{ role: 'user', content: 'hello' }],
      immutableCore: 'persona core block',
      personaId: 'persona-abc',
      sessionId: 'session-abc',
    });

    const second = await router.streamChat({
      messages: [{ role: 'user', content: 'hello' }],
      immutableCore: 'persona core block',
      personaId: 'persona-abc',
      sessionId: 'session-abc',
    });

    expect(first.cacheId).toBeDefined();
    expect(first.cacheReused).toBe(false);
    expect(second.cacheId).toBe(first.cacheId);
    expect(second.cacheReused).toBe(true);
  });

  it('routes embed calls through resolved provider/model', async () => {
    const provider = new MockProvider({ id: 'embed-only' });
    const router = new ModelRouter({
      providerLookup: makeLookup([provider]),
      defaultProviderOrder: {
        chat: ['embed-only'],
        embedding: ['embed-only'],
        multimodal: ['embed-only'],
      },
      defaultModels: {
        'embed-only': {
          embedding: 'embed-model-custom',
        },
      },
    });

    const result = await router.embed({
      model: 'ignored-by-router',
      input: 'abc',
    });

    expect(result.model).toBe('ignored-by-router');
    expect(result.vectors[0].length).toBeGreaterThan(0);
  });
});
