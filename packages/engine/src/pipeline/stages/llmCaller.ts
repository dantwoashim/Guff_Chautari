import { defaultProviderRegistry } from '../../../providers';
import type {
  ModelProvider,
  ProviderChatContent,
  ProviderChatMessage,
  ProviderChatRole,
  ProviderContentPart,
  StreamChatRequest,
} from '../../../providers';
import type { Attachment, Message } from '../../../../types';
import type {
  LLMCallerOutput,
  LLMChunk,
  PipelineStage,
  PromptBuilderOutput,
} from '../types';

const DEFAULT_TIMEOUT_MS = 25_000;
const DEFAULT_MODEL = 'gemini-2.5-flash';
const TOOL_CALL_PATTERN = /\[\[tool:([a-z0-9_.-]+)(?:\s+({[\s\S]*?}))?\]\]/i;

interface LLMCallerDependencies {
  resolveProvider: (providerId: string) => ModelProvider;
  timeoutMs: number;
  defaultModel: string;
}

const defaultDependencies: LLMCallerDependencies = {
  resolveProvider: (providerId: string) => defaultProviderRegistry.resolve(providerId),
  timeoutMs: DEFAULT_TIMEOUT_MS,
  defaultModel: DEFAULT_MODEL,
};

const mapRole = (role: string): ProviderChatRole => {
  return role === 'model' ? 'assistant' : 'user';
};

const extractFromDataUrl = (value: string | undefined): { mimeType: string; data: string } | null => {
  if (!value || !value.startsWith('data:')) {
    return null;
  }

  const [header, payload] = value.split(',', 2);
  if (!payload) {
    return null;
  }

  const mimeType = header?.slice(5).split(';')[0] || 'application/octet-stream';
  return {
    mimeType,
    data: payload,
  };
};

const attachmentToProviderPart = (attachment: Attachment): ProviderContentPart | null => {
  if (attachment.data?.trim()) {
    return {
      type: 'inline_data',
      mimeType: attachment.mimeType || 'application/octet-stream',
      data: attachment.data.trim(),
    };
  }

  const fromDataUrl = extractFromDataUrl(attachment.url);
  if (fromDataUrl) {
    return {
      type: 'inline_data',
      mimeType: attachment.mimeType || fromDataUrl.mimeType,
      data: fromDataUrl.data,
    };
  }

  if (attachment.url?.trim()) {
    return {
      type: 'file_uri',
      mimeType: attachment.mimeType || 'application/octet-stream',
      uri: attachment.url.trim(),
    };
  }

  return null;
};

const summarizeAttachments = (attachments: Attachment[] | undefined): string => {
  if (!attachments || attachments.length === 0) {
    return '';
  }
  const label = attachments
    .map((attachment) => attachment.type || attachment.mimeType || 'file')
    .join(', ');
  return `[User shared ${attachments.length} attachment(s): ${label}]`;
};

const toHistoryContent = (message: Message): ProviderChatContent => {
  const text = message.text.trim();
  if (text.length > 0) {
    return text;
  }
  const summary = summarizeAttachments(message.attachments);
  return summary || '';
};

const toUserTurnContent = (message: Message): ProviderChatContent => {
  const parts: ProviderContentPart[] = [];

  const trimmedText = message.text.trim();
  if (trimmedText.length > 0) {
    parts.push({ type: 'text', text: trimmedText });
  }

  for (const attachment of message.attachments || []) {
    const converted = attachmentToProviderPart(attachment);
    if (converted) {
      parts.push(converted);
    }
  }

  if (parts.length === 0) {
    const summary = summarizeAttachments(message.attachments);
    if (summary) {
      return summary;
    }
    return '';
  }

  const hasText = parts.some((part) => part.type === 'text');
  if (!hasText) {
    parts.unshift({
      type: 'text',
      text: 'Analyze and respond to the provided attachment(s) naturally.',
    });
  }

  return parts;
};

const hasNonEmptyContent = (content: ProviderChatContent): boolean => {
  if (typeof content === 'string') {
    return content.trim().length > 0;
  }

  return content.some((part) => {
    if (part.type === 'text') {
      return part.text.trim().length > 0;
    }
    if (part.type === 'inline_data') {
      return part.data.trim().length > 0;
    }
    return part.uri.trim().length > 0;
  });
};

const parseToolCall = (
  value: string
): { fullMatch: string; toolId: string; payload: Record<string, unknown> } | null => {
  const match = value.match(TOOL_CALL_PATTERN);
  if (!match) return null;

  const toolId = match[1]?.trim();
  if (!toolId) return null;

  let payload: Record<string, unknown> = {};
  if (match[2]) {
    try {
      const parsed = JSON.parse(match[2]);
      if (parsed && typeof parsed === 'object') {
        payload = parsed as Record<string, unknown>;
      }
    } catch {
      payload = {};
    }
  }

  return {
    fullMatch: match[0],
    toolId,
    payload,
  };
};

const buildMessages = (input: PromptBuilderOutput): ProviderChatMessage[] => {
  const recentHistory = input.context.history.slice(-8);
  const historyMessages = recentHistory
    .map((message) => ({
      role: mapRole(message.role),
      content: toHistoryContent(message),
    }))
    .filter((message) => hasNonEmptyContent(message.content));

  const userTurnContent = toUserTurnContent(input.input.userMessage);

  return [
    {
      role: 'system',
      content: input.prompt.systemInstruction,
    },
    ...historyMessages,
    {
      role: 'user',
      content: hasNonEmptyContent(userTurnContent) ? userTurnContent : '[No message content]',
    },
  ];
};

const raceAbort = async <T>(
  promise: Promise<T>,
  signal: AbortSignal,
  onAbort: () => void
): Promise<T> => {
  if (signal.aborted) {
    onAbort();
    throw new Error('aborted');
  }

  return await new Promise<T>((resolve, reject) => {
    const abortHandler = (): void => {
      onAbort();
      reject(new Error('aborted'));
    };

    signal.addEventListener('abort', abortHandler, { once: true });

    promise
      .then((value) => {
        signal.removeEventListener('abort', abortHandler);
        resolve(value);
      })
      .catch((error: unknown) => {
        signal.removeEventListener('abort', abortHandler);
        reject(error);
      });
  });
};

const makeEmptyResult = (
  input: PromptBuilderOutput,
  providerId: string,
  model: string,
  cancelled: boolean,
  timedOut: boolean
): LLMCallerOutput => {
  return {
    ...input,
    llm: {
      text: '',
      chunks: [],
      cancelled,
      timedOut,
      providerId,
      model,
    },
  };
};

export const createLLMCaller = (
  partialDependencies: Partial<LLMCallerDependencies> = {}
): PipelineStage<PromptBuilderOutput, LLMCallerOutput> => {
  const dependencies: LLMCallerDependencies = {
    ...defaultDependencies,
    ...partialDependencies,
  };

  return {
    name: 'llmCaller',
    async run(input: PromptBuilderOutput): Promise<LLMCallerOutput> {
      const providerId = input.input.provider || 'gemini';
      const model = input.input.model || dependencies.defaultModel;
      const externalSignal = input.input.abortSignal;

      if (externalSignal?.aborted) {
        return makeEmptyResult(input, providerId, model, true, false);
      }

      const provider = dependencies.resolveProvider(providerId);
      const controller = new AbortController();
      const chunks: LLMChunk[] = [];
      let text = '';
      let cancelled = false;
      let timedOut = false;

      const timeoutHandle = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, dependencies.timeoutMs);

      const externalAbortListener = (): void => {
        cancelled = true;
        controller.abort();
      };

      externalSignal?.addEventListener('abort', externalAbortListener, { once: true });

      try {
        const request: StreamChatRequest = {
          model,
          messages: buildMessages(input),
          temperature: input.input.temperature,
          apiKey: input.input.apiKey,
          signal: controller.signal,
        };

        const stream = provider.streamChat(request);
        const iterator = stream[Symbol.asyncIterator]();

        while (true) {
          const result = await raceAbort(iterator.next(), controller.signal, () => {
            // Cancellation flow handled by control flags above.
          });

          if (result.done) {
            break;
          }

          const chunkText = result.value.text ?? '';
          if (chunkText.length === 0) {
            continue;
          }

          text += chunkText;
          chunks.push({
            text: chunkText,
            index: chunks.length,
            isFinal: false,
            receivedAt: Date.now(),
          });
        }
      } catch (error) {
        const abortLike =
          controller.signal.aborted || (error instanceof Error && error.message.toLowerCase().includes('abort'));
        if (!abortLike) {
          throw error;
        }
        if (!timedOut) {
          cancelled = true;
        }
      } finally {
        clearTimeout(timeoutHandle);
        externalSignal?.removeEventListener('abort', externalAbortListener);
      }

      if (chunks.length > 0) {
        chunks[chunks.length - 1].isFinal = !cancelled && !timedOut;
      }

      if (!cancelled && !timedOut && input.input.pluginTools) {
        const toolCall = parseToolCall(text);
        if (toolCall) {
          const pluginTools = input.input.pluginTools;
          if (!pluginTools.allowedToolIds.includes(toolCall.toolId)) {
            const deniedSummary = `[Plugin tool denied] ${toolCall.toolId} is not in allowed tool scope.`;
            text = text.replace(toolCall.fullMatch, '').trim();
            text = `${text}\n${deniedSummary}`.trim();
            chunks.push({
              text: `\n${deniedSummary}`,
              index: chunks.length,
              isFinal: true,
              receivedAt: Date.now(),
            });
          } else {
            const toolResult = await pluginTools.invoke(toolCall.toolId, toolCall.payload);
            const summaryPrefix = toolResult.ok ? '[Plugin tool result]' : '[Plugin tool failed]';
            const summary = `${summaryPrefix} ${toolResult.summary}`;
            text = text.replace(toolCall.fullMatch, '').trim();
            text = `${text}\n${summary}`.trim();
            chunks.push({
              text: `\n${summary}`,
              index: chunks.length,
              isFinal: true,
              receivedAt: Date.now(),
            });
          }
        }
      }

      return {
        ...input,
        llm: {
          text,
          chunks,
          cancelled,
          timedOut,
          providerId: provider.id,
          model,
        },
      };
    },
  };
};

export const llmCaller = createLLMCaller();
