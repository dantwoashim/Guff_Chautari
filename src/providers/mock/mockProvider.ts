import type {
  EmbedRequest,
  EmbedResponse,
  ModelProvider,
  ProviderChatContent,
  ProviderStreamChunk,
  ProviderValidationResult,
  StreamChatRequest,
} from '../types';

export type MockFailureMode = 'none' | 'auth' | 'quota' | 'network';

export interface MockProviderOptions {
  id?: string;
  latencyMs?: number;
  chunkSize?: number;
  defaultResponse?: string;
  responseByPrompt?: Record<string, string>;
  failureModes?: Partial<Record<'validateKey' | 'streamChat' | 'embed', MockFailureMode>>;
}

const wait = async (ms: number): Promise<void> => {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
};

const contentToText = (content: ProviderChatContent): string => {
  if (typeof content === 'string') {
    return content;
  }

  return content
    .map((part) => {
      if (part.type === 'text') {
        return part.text;
      }
      return '';
    })
    .join(' ');
};

const normalizePrompt = (request: StreamChatRequest): string => {
  const userMessage = [...request.messages].reverse().find((message) => message.role === 'user');
  return contentToText(userMessage?.content ?? '').trim().toLowerCase();
};

const splitChunks = (text: string, chunkSize: number): string[] => {
  const normalized = text.trim();
  if (!normalized) return [''];

  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < normalized.length) {
    chunks.push(normalized.slice(cursor, cursor + chunkSize));
    cursor += chunkSize;
  }
  return chunks;
};

const hashText = (text: string): number => {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
};

const failureError = (mode: MockFailureMode): Error => {
  switch (mode) {
    case 'auth':
      return new Error('401 auth failed');
    case 'quota':
      return new Error('429 quota exceeded');
    case 'network':
      return new Error('network timeout');
    default:
      return new Error('mock provider error');
  }
};

export class MockProvider implements ModelProvider {
  readonly id: string;

  private readonly latencyMs: number;
  private readonly chunkSize: number;
  private readonly defaultResponse: string;
  private readonly responseByPrompt: Record<string, string>;
  private readonly failureModes: Partial<Record<'validateKey' | 'streamChat' | 'embed', MockFailureMode>>;

  constructor(options: MockProviderOptions = {}) {
    this.id = options.id ?? 'mock';
    this.latencyMs = options.latencyMs ?? 0;
    this.chunkSize = options.chunkSize ?? 64;
    this.defaultResponse = options.defaultResponse ?? 'mock deterministic response';
    this.responseByPrompt = options.responseByPrompt ?? {};
    this.failureModes = options.failureModes ?? {};
  }

  async validateKey(apiKey: string): Promise<ProviderValidationResult> {
    await wait(this.latencyMs);

    const mode = this.failureModes.validateKey ?? 'none';
    if (mode === 'auth') {
      return {
        ok: false,
        status: 'invalid',
        errorCode: 'auth_failed',
        errorMessage: 'Mock key rejected.',
      };
    }

    if (mode === 'quota') {
      return {
        ok: true,
        status: 'warning',
        errorCode: 'quota_exceeded',
        errorMessage: 'Mock key is over quota.',
      };
    }

    if (!apiKey.trim()) {
      return {
        ok: false,
        status: 'invalid',
        errorCode: 'empty_key',
        errorMessage: 'Key required.',
      };
    }

    return {
      ok: true,
      status: 'healthy',
    };
  }

  async *streamChat(request: StreamChatRequest): AsyncIterable<ProviderStreamChunk> {
    const mode = this.failureModes.streamChat ?? 'none';
    if (mode !== 'none') {
      throw failureError(mode);
    }

    const prompt = normalizePrompt(request);
    const mapped = this.responseByPrompt[prompt];
    const responseText = mapped ?? `${this.defaultResponse}#${hashText(prompt).toString(16)}`;

    const chunks = splitChunks(responseText, this.chunkSize);
    for (let index = 0; index < chunks.length; index += 1) {
      if (request.signal?.aborted) {
        throw new Error('aborted');
      }
      await wait(this.latencyMs);
      yield {
        text: chunks[index],
        done: index === chunks.length - 1,
      };
    }
  }

  async embed(request: EmbedRequest): Promise<EmbedResponse> {
    const mode = this.failureModes.embed ?? 'none';
    if (mode !== 'none') {
      throw failureError(mode);
    }

    await wait(this.latencyMs);

    const values = Array.isArray(request.input) ? request.input : [request.input];
    const vectors = values.map((value) => {
      const base = hashText(value);
      return [
        (base % 1000) / 1000,
        ((base >> 2) % 1000) / 1000,
        ((base >> 4) % 1000) / 1000,
      ];
    });

    return {
      model: request.model,
      vectors,
      dimensions: 3,
    };
  }
}
