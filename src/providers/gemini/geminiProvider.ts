import { getRuntimeGeminiKey } from '../../byok/runtimeKey';
import { validateGeminiKey } from '../../byok/keyHealth';
import type {
  EmbedRequest,
  EmbedResponse,
  ModelProvider,
  ProviderChatContent,
  ProviderChatMessage,
  ProviderContentPart,
  ProviderStreamChunk,
  ProviderValidationResult,
  StreamChatRequest,
} from '../types';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_CHAT_MODEL = 'gemini-2.5-flash';
const DEFAULT_EMBED_MODEL = 'text-embedding-004';
const DEFAULT_CHUNK_SIZE = 140;

type FetchLike = typeof fetch;

interface GeminiProviderOptions {
  apiKey?: string;
  getApiKey?: () => string | null;
  fetchFn?: FetchLike;
  defaultChatModel?: string;
  defaultEmbedModel?: string;
  chunkSize?: number;
}

interface GeminiTextPart {
  text: string;
}

interface GeminiInlineDataPart {
  inline_data: {
    mime_type: string;
    data: string;
  };
}

interface GeminiFileDataPart {
  file_data: {
    mime_type: string;
    file_uri: string;
  };
}

type GeminiRequestPart = GeminiTextPart | GeminiInlineDataPart | GeminiFileDataPart;

interface GeminiRequestContent {
  role: 'user' | 'model';
  parts: GeminiRequestPart[];
}

interface GeminiGenerateContentRequest {
  contents: GeminiRequestContent[];
  system_instruction?: {
    parts: Array<{ text: string }>;
  };
  generationConfig: {
    temperature?: number;
    maxOutputTokens?: number;
  };
}

interface GeminiResponseContentPart {
  text?: string;
}

interface GeminiCandidate {
  content?: {
    parts?: GeminiResponseContentPart[];
  };
}

interface GeminiGenerateContentResponse {
  candidates?: GeminiCandidate[];
}

interface GeminiEmbeddingResponse {
  embedding?: {
    values?: number[];
  };
}

const splitIntoChunks = (value: string, chunkSize: number): string[] => {
  const normalized = value.trim();
  if (!normalized) return [''];

  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < normalized.length) {
    chunks.push(normalized.slice(cursor, cursor + chunkSize));
    cursor += chunkSize;
  }
  return chunks;
};

const readErrorMessage = async (response: Response): Promise<string> => {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    const message = body?.error?.message;
    if (typeof message === 'string' && message.length > 0) {
      return message;
    }
  } catch {
    // Ignore JSON parse failures and use fallback message.
  }

  return `Gemini request failed with status ${response.status}.`;
};

const extractText = (payload: GeminiGenerateContentResponse): string => {
  const candidates = payload.candidates ?? [];
  for (const candidate of candidates) {
    const parts = candidate.content?.parts ?? [];
    const pieces = parts.map((part) => part.text ?? '').filter((text) => text.length > 0);
    if (pieces.length > 0) {
      return pieces.join('');
    }
  }
  return '';
};

const contentToPlainText = (content: ProviderChatContent): string => {
  if (typeof content === 'string') {
    return content;
  }

  return content
    .map((part) => {
      if (part.type === 'text') {
        return part.text;
      }
      if (part.type === 'file_uri') {
        return `[file: ${part.mimeType}]`;
      }
      if (part.type === 'inline_data') {
        return `[inline_media: ${part.mimeType}]`;
      }
      return '';
    })
    .join(' ');
};

const serializeMessages = (messages: ProviderChatMessage[]): string => {
  return messages
    .map((message) => ({
      role: message.role,
      text: contentToPlainText(message.content).trim(),
    }))
    .filter((message) => message.text.length > 0)
    .map((message) => `${message.role.toUpperCase()}: ${message.text}`)
    .join('\n\n');
};

const toGeminiPart = (part: ProviderContentPart): GeminiRequestPart | null => {
  if (part.type === 'text') {
    const text = part.text.trim();
    if (!text) return null;
    return { text };
  }

  if (part.type === 'inline_data') {
    const data = part.data.trim();
    if (!data) return null;
    return {
      inline_data: {
        mime_type: part.mimeType || 'application/octet-stream',
        data,
      },
    };
  }

  const uri = part.uri.trim();
  if (!uri) return null;
  return {
    file_data: {
      mime_type: part.mimeType || 'application/octet-stream',
      file_uri: uri,
    },
  };
};

const toGeminiParts = (content: ProviderChatContent): GeminiRequestPart[] => {
  if (typeof content === 'string') {
    const trimmed = content.trim();
    return trimmed ? [{ text: trimmed }] : [];
  }

  return content
    .map((part) => toGeminiPart(part))
    .filter((part): part is GeminiRequestPart => Boolean(part));
};

const hasMultimodalContent = (content: ProviderChatContent): boolean => {
  if (typeof content === 'string') return false;
  return content.some((part) => part.type !== 'text');
};

const buildRequestPayload = (
  messages: ProviderChatMessage[],
  request: StreamChatRequest
): GeminiGenerateContentRequest => {
  const generationConfig = {
    temperature: request.temperature,
    maxOutputTokens: request.maxTokens,
  };

  const containsMultimodal = messages.some((message) => hasMultimodalContent(message.content));
  if (!containsMultimodal) {
    const promptText = serializeMessages(messages);
    return {
      contents: [{ role: 'user', parts: [{ text: promptText }] }],
      generationConfig,
    };
  }

  const systemLines: string[] = [];
  const contents: GeminiRequestContent[] = [];

  for (const message of messages) {
    if (message.role === 'system') {
      const systemText = contentToPlainText(message.content).trim();
      if (systemText.length > 0) {
        systemLines.push(systemText);
      }
      continue;
    }

    const parts = toGeminiParts(message.content);
    if (parts.length === 0) {
      continue;
    }

    contents.push({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts,
    });
  }

  if (contents.length === 0) {
    contents.push({
      role: 'user',
      parts: [{ text: 'Respond naturally and contextually.' }],
    });
  }

  const payload: GeminiGenerateContentRequest = {
    contents,
    generationConfig,
  };

  const systemInstruction = systemLines.join('\n\n').trim();
  if (systemInstruction.length > 0) {
    payload.system_instruction = {
      parts: [{ text: systemInstruction }],
    };
  }

  return payload;
};

export class GeminiProvider implements ModelProvider {
  readonly id = 'gemini';

  private readonly fetchFn: FetchLike;
  private readonly staticApiKey?: string;
  private readonly getApiKey?: () => string | null;
  private readonly defaultChatModel: string;
  private readonly defaultEmbedModel: string;
  private readonly chunkSize: number;

  constructor(options: GeminiProviderOptions = {}) {
    this.fetchFn = options.fetchFn ?? fetch;
    this.staticApiKey = options.apiKey;
    this.getApiKey = options.getApiKey;
    this.defaultChatModel = options.defaultChatModel ?? DEFAULT_CHAT_MODEL;
    this.defaultEmbedModel = options.defaultEmbedModel ?? DEFAULT_EMBED_MODEL;
    this.chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  }

  async validateKey(apiKey: string): Promise<ProviderValidationResult> {
    const result = await validateGeminiKey(apiKey);
    const status =
      result.status === 'healthy' || result.status === 'warning' || result.status === 'invalid'
        ? result.status
        : 'warning';

    return {
      ok: result.ok,
      status,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
    };
  }

  async *streamChat(request: StreamChatRequest): AsyncIterable<ProviderStreamChunk> {
    const apiKey = this.resolveApiKey(request.apiKey);
    const model = request.model || this.defaultChatModel;
    const requestPayload = buildRequestPayload(request.messages, request);

    const response = await this.fetchFn(
      `${GEMINI_API_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(requestPayload),
        signal: request.signal,
      }
    );

    if (!response.ok) {
      const message = await readErrorMessage(response);
      throw new Error(message);
    }

    const responsePayload = (await response.json()) as GeminiGenerateContentResponse;
    const text = extractText(responsePayload);

    const parts = splitIntoChunks(text, this.chunkSize);
    for (let index = 0; index < parts.length; index += 1) {
      yield {
        text: parts[index],
        done: index === parts.length - 1,
        raw: responsePayload,
      };
    }
  }

  async embed(request: EmbedRequest): Promise<EmbedResponse> {
    const apiKey = this.resolveApiKey(request.apiKey);
    const model = request.model || this.defaultEmbedModel;
    const inputs = Array.isArray(request.input) ? request.input : [request.input];

    const vectors: number[][] = [];

    for (const value of inputs) {
      const response = await this.fetchFn(
        `${GEMINI_API_BASE}/models/${encodeURIComponent(model)}:embedContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            content: {
              parts: [{ text: value }],
            },
          }),
          signal: request.signal,
        }
      );

      if (!response.ok) {
        const message = await readErrorMessage(response);
        throw new Error(message);
      }

      const payload = (await response.json()) as GeminiEmbeddingResponse;
      const vector = payload.embedding?.values;
      if (!vector || !Array.isArray(vector) || vector.length === 0) {
        throw new Error('Gemini embedding response did not include vector values.');
      }
      vectors.push(vector);
    }

    return {
      model,
      vectors,
      dimensions: vectors[0]?.length ?? 0,
    };
  }

  private resolveApiKey(explicitApiKey?: string): string {
    const direct = explicitApiKey?.trim();
    if (direct) return direct;

    const fromOptions = this.staticApiKey?.trim();
    if (fromOptions) return fromOptions;

    const dynamic = this.getApiKey?.()?.trim();
    if (dynamic) return dynamic;

    const runtime = getRuntimeGeminiKey()?.trim();
    if (runtime) return runtime;

    throw new Error('Gemini API key is missing. Configure BYOK before calling the provider.');
  }
}
