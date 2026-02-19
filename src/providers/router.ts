import { geminiContextCache, type GeminiContextCache } from './gemini/geminiCache';
import { defaultProviderRegistry } from './registry';
import type {
  EmbedRequest,
  EmbedResponse,
  ModelProvider,
  ProviderChatMessage,
  ProviderStreamChunk,
  StreamChatRequest,
} from './types';

export type ModelTaskClass = 'chat' | 'embedding' | 'multimodal';
export type FailureClassification =
  | 'auth_error'
  | 'quota_error'
  | 'network_error'
  | 'rate_limited'
  | 'provider_error'
  | 'unknown';

export interface ModelRoute {
  provider: ModelProvider;
  providerId: string;
  task: ModelTaskClass;
  model: string;
  usedFallback: boolean;
  cacheId?: string;
  cacheReused?: boolean;
}

export interface RouteTaskRequest {
  task: ModelTaskClass;
  preferredProviderId?: string;
  preferredModel?: string;
  apiKey?: string;
  allowFallback?: boolean;
  immutableCore?: string;
  personaId?: string;
  sessionId?: string;
}

export interface StreamChatWithRouterRequest {
  messages: ProviderChatMessage[];
  preferredProviderId?: string;
  preferredModel?: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  allowFallback?: boolean;
  immutableCore?: string;
  personaId?: string;
  sessionId?: string;
}

export interface StreamChatWithRouterResult {
  providerId: string;
  model: string;
  text: string;
  chunks: ProviderStreamChunk[];
  usedFallback: boolean;
  failureClass?: FailureClassification;
  cacheId?: string;
  cacheReused?: boolean;
}

interface RouterProviderLookup {
  resolve(providerId: string): ModelProvider;
  list(): string[];
}

interface ModelRouterOptions {
  providerLookup?: RouterProviderLookup;
  defaultProviderOrder?: Partial<Record<ModelTaskClass, string[]>>;
  defaultModels?: Partial<Record<string, Partial<Record<ModelTaskClass, string>>>>;
  cache?: GeminiContextCache;
}

const DEFAULT_MODELS: Record<string, Record<ModelTaskClass, string>> = {
  gemini: {
    chat: 'gemini-2.5-flash',
    embedding: 'text-embedding-004',
    multimodal: 'gemini-2.5-pro',
  },
};

const defaultProviderOrder: Record<ModelTaskClass, string[]> = {
  chat: ['gemini'],
  embedding: ['gemini'],
  multimodal: ['gemini'],
};

const normalizeErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message.toLowerCase();
  }
  return String(error).toLowerCase();
};

export class ModelRouterError extends Error {
  readonly providerId: string;
  readonly classification: FailureClassification;

  constructor(message: string, providerId: string, classification: FailureClassification) {
    super(message);
    this.name = 'ModelRouterError';
    this.providerId = providerId;
    this.classification = classification;
  }
}

export class ModelRouter {
  private readonly providerLookup: RouterProviderLookup;
  private readonly providerOrder: Record<ModelTaskClass, string[]>;
  private readonly defaultModels: Record<string, Record<ModelTaskClass, string>>;
  private readonly cache: GeminiContextCache;

  constructor(options: ModelRouterOptions = {}) {
    this.providerLookup = options.providerLookup ?? defaultProviderRegistry;
    this.providerOrder = {
      chat: options.defaultProviderOrder?.chat ?? defaultProviderOrder.chat,
      embedding: options.defaultProviderOrder?.embedding ?? defaultProviderOrder.embedding,
      multimodal: options.defaultProviderOrder?.multimodal ?? defaultProviderOrder.multimodal,
    };

    this.defaultModels = {
      ...DEFAULT_MODELS,
      ...Object.fromEntries(
        Object.entries(options.defaultModels ?? {}).map(([providerId, models]) => {
          const base = DEFAULT_MODELS[providerId] ?? {
            chat: 'model-chat',
            embedding: 'model-embedding',
            multimodal: 'model-multimodal',
          };
          return [providerId, { ...base, ...models }];
        })
      ),
    };

    this.cache = options.cache ?? geminiContextCache;
  }

  classifyFailure(error: unknown): FailureClassification {
    const message = normalizeErrorMessage(error);

    if (
      message.includes('401') ||
      message.includes('403') ||
      message.includes('auth') ||
      message.includes('invalid api key')
    ) {
      return 'auth_error';
    }

    if (message.includes('quota') || message.includes('429')) {
      return 'quota_error';
    }

    if (message.includes('rate limit')) {
      return 'rate_limited';
    }

    if (message.includes('network') || message.includes('fetch') || message.includes('timeout')) {
      return 'network_error';
    }

    if (message.includes('provider')) {
      return 'provider_error';
    }

    return 'unknown';
  }

  async resolveTaskRoute(request: RouteTaskRequest): Promise<ModelRoute> {
    const candidates = this.getCandidates(request.task, request.preferredProviderId);
    const allowFallback = request.allowFallback !== false;

    let usedFallback = false;
    let lastError: ModelRouterError | null = null;

    for (let index = 0; index < candidates.length; index += 1) {
      const providerId = candidates[index];
      const provider = this.providerLookup.resolve(providerId);

      const healthError = await this.evaluateProviderHealth(provider, providerId, request.apiKey);
      if (healthError) {
        if (healthError.classification === 'auth_error') {
          throw healthError;
        }
        lastError = healthError;
        if (!allowFallback || index === candidates.length - 1) {
          throw healthError;
        }
        usedFallback = true;
        continue;
      }

      const model = request.preferredModel ?? this.getDefaultModel(providerId, request.task);
      const route: ModelRoute = {
        provider,
        providerId,
        task: request.task,
        model,
        usedFallback,
      };

      if (providerId === 'gemini' && request.immutableCore && request.personaId) {
        const cacheResult = this.cache.getOrCreate({
          personaId: request.personaId,
          sessionId: request.sessionId,
          immutableCore: request.immutableCore,
        });
        route.cacheId = cacheResult.entry.cacheId;
        route.cacheReused = cacheResult.reused;
      }

      return route;
    }

    throw lastError ?? new ModelRouterError('No provider route available.', 'unknown', 'unknown');
  }

  async streamChat(request: StreamChatWithRouterRequest): Promise<StreamChatWithRouterResult> {
    const candidates = this.getCandidates('chat', request.preferredProviderId);
    const allowFallback = request.allowFallback !== false;
    let usedFallback = false;
    let lastError: ModelRouterError | null = null;

    for (let index = 0; index < candidates.length; index += 1) {
      const providerId = candidates[index];
      const provider = this.providerLookup.resolve(providerId);

      const healthError = await this.evaluateProviderHealth(provider, providerId, request.apiKey);
      if (healthError) {
        if (healthError.classification === 'auth_error') {
          throw healthError;
        }
        lastError = healthError;
        if (!allowFallback || index === candidates.length - 1) {
          throw healthError;
        }
        usedFallback = true;
        continue;
      }

      const model = request.preferredModel ?? this.getDefaultModel(providerId, 'chat');
      let cacheId: string | undefined;
      let cacheReused: boolean | undefined;

      if (providerId === 'gemini' && request.immutableCore && request.personaId) {
        const cacheResult = this.cache.getOrCreate({
          personaId: request.personaId,
          sessionId: request.sessionId,
          immutableCore: request.immutableCore,
        });
        cacheId = cacheResult.entry.cacheId;
        cacheReused = cacheResult.reused;
      }

      const providerRequest: StreamChatRequest = {
        model,
        messages: request.messages,
        apiKey: request.apiKey,
        temperature: request.temperature,
        maxTokens: request.maxTokens,
        signal: request.signal,
        metadata: cacheId ? { immutableCoreCacheId: cacheId } : undefined,
      };

      try {
        const chunks: ProviderStreamChunk[] = [];
        let text = '';

        for await (const chunk of provider.streamChat(providerRequest)) {
          chunks.push(chunk);
          text += chunk.text;
        }

        return {
          providerId,
          model,
          text,
          chunks,
          usedFallback,
          cacheId,
          cacheReused,
        };
      } catch (error) {
        const classification = this.classifyFailure(error);
        lastError = new ModelRouterError(
          `Provider ${providerId} failed: ${error instanceof Error ? error.message : String(error)}`,
          providerId,
          classification
        );

        if (classification === 'auth_error') {
          throw lastError;
        }

        if ((classification === 'quota_error' || classification === 'rate_limited') && allowFallback && index < candidates.length - 1) {
          usedFallback = true;
          continue;
        }

        throw lastError;
      }
    }

    throw lastError ?? new ModelRouterError('Failed to stream chat with available providers.', 'unknown', 'unknown');
  }

  async embed(request: EmbedRequest & { preferredProviderId?: string; allowFallback?: boolean }): Promise<EmbedResponse> {
    const route = await this.resolveTaskRoute({
      task: 'embedding',
      preferredProviderId: request.preferredProviderId,
      preferredModel: request.model,
      apiKey: request.apiKey,
      allowFallback: request.allowFallback,
    });

    return route.provider.embed({
      ...request,
      model: route.model,
    });
  }

  private getCandidates(task: ModelTaskClass, preferredProviderId?: string): string[] {
    const ordered = this.providerOrder[task];
    const known = this.providerLookup.list();
    const validOrdered = ordered.filter((id) => known.includes(id));

    if (!preferredProviderId) {
      return validOrdered;
    }

    if (!known.includes(preferredProviderId)) {
      return validOrdered;
    }

    return [preferredProviderId, ...validOrdered.filter((id) => id !== preferredProviderId)];
  }

  private getDefaultModel(providerId: string, task: ModelTaskClass): string {
    const providerModels = this.defaultModels[providerId];
    if (providerModels) {
      return providerModels[task];
    }

    switch (task) {
      case 'embedding':
        return 'model-embedding';
      case 'multimodal':
        return 'model-multimodal';
      default:
        return 'model-chat';
    }
  }

  private async evaluateProviderHealth(
    provider: ModelProvider,
    providerId: string,
    apiKey?: string
  ): Promise<ModelRouterError | null> {
    if (!apiKey) {
      return null;
    }

    const validation = await provider.validateKey(apiKey);

    if (validation.ok && validation.status !== 'invalid') {
      if (validation.errorCode === 'quota_exceeded') {
        return new ModelRouterError(
          `Provider ${providerId} key is over quota.`,
          providerId,
          'quota_error'
        );
      }
      return null;
    }

    if (validation.errorCode === 'quota_exceeded') {
      return new ModelRouterError(`Provider ${providerId} key is over quota.`, providerId, 'quota_error');
    }

    return new ModelRouterError(
      validation.errorMessage || `Provider ${providerId} key is invalid.`,
      providerId,
      'auth_error'
    );
  }
}

export const modelRouter = new ModelRouter();
