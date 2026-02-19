export type ProviderHealthStatus = 'healthy' | 'warning' | 'invalid';

export interface ProviderValidationResult {
  ok: boolean;
  status: ProviderHealthStatus;
  errorCode?: string;
  errorMessage?: string;
}

export type ProviderChatRole = 'system' | 'user' | 'assistant';

export type ProviderContentPart =
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'inline_data';
      mimeType: string;
      data: string;
    }
  | {
      type: 'file_uri';
      mimeType: string;
      uri: string;
    };

export type ProviderChatContent = string | ProviderContentPart[];

export interface ProviderChatMessage {
  role: ProviderChatRole;
  content: ProviderChatContent;
}

export interface StreamChatRequest {
  model: string;
  messages: ProviderChatMessage[];
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  metadata?: Record<string, string>;
}

export interface ProviderStreamChunk {
  text: string;
  done?: boolean;
  raw?: unknown;
}

export interface EmbedRequest {
  model: string;
  input: string | string[];
  apiKey?: string;
  signal?: AbortSignal;
}

export interface EmbedResponse {
  model: string;
  vectors: number[][];
  dimensions: number;
}

export interface ImageGenerationRequest {
  model: string;
  prompt: string;
  apiKey?: string;
  signal?: AbortSignal;
}

export interface ImageGenerationResponse {
  imageBase64: string;
  mimeType: string;
}

export interface TranscriptionRequest {
  model: string;
  audioBase64: string;
  mimeType: string;
  apiKey?: string;
  signal?: AbortSignal;
}

export interface TranscriptionResponse {
  text: string;
}

export interface ModelProvider {
  readonly id: string;
  validateKey(apiKey: string): Promise<ProviderValidationResult>;
  streamChat(request: StreamChatRequest): AsyncIterable<ProviderStreamChunk>;
  embed(request: EmbedRequest): Promise<EmbedResponse>;
  generateImage?(request: ImageGenerationRequest): Promise<ImageGenerationResponse>;
  transcribe?(request: TranscriptionRequest): Promise<TranscriptionResponse>;
}
