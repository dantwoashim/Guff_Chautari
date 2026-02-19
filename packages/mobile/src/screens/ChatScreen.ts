import type { SharedMessage } from '../../../shared/src/types';

export interface ChatAttachment {
  id: string;
  mimeType: string;
  name: string;
  uri: string;
}

export interface ChatPersonaTheme {
  personaId: string;
  bubbleAccent: string;
  avatarVariant: 'calm' | 'energetic' | 'mentor';
}

export interface ChatPipelineAdapter {
  run: (payload: {
    conversationId: string;
    text: string;
    attachments: ChatAttachment[];
  }) => Promise<{
    text: string;
    chunks?: string[];
  }>;
}

export interface ChatScreenState {
  conversationId: string;
  messages: SharedMessage[];
  streaming: boolean;
  pendingReplyToMessageId: string | null;
  personaTheme: ChatPersonaTheme;
}

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

export const createChatScreenState = (payload: {
  conversationId: string;
  personaTheme: ChatPersonaTheme;
}): ChatScreenState => ({
  conversationId: payload.conversationId,
  messages: [],
  streaming: false,
  pendingReplyToMessageId: null,
  personaTheme: payload.personaTheme,
});

export const beginReplyGesture = (
  state: ChatScreenState,
  messageId: string
): ChatScreenState => ({
  ...state,
  pendingReplyToMessageId: messageId,
});

export const handleLongPressQuickAction = (
  state: ChatScreenState,
  payload: { action: 'copy' | 'reply' | 'star'; messageId: string }
): ChatScreenState => {
  if (payload.action === 'reply') {
    return beginReplyGesture(state, payload.messageId);
  }
  return state;
};

export const sendChatMessage = async (
  state: ChatScreenState,
  payload: {
    text: string;
    attachments?: ChatAttachment[];
    nowIso: string;
    pipeline: ChatPipelineAdapter;
  }
): Promise<ChatScreenState> => {
  const attachments = payload.attachments ?? [];
  const userMessage: SharedMessage = {
    id: makeId('mobile-message'),
    conversationId: state.conversationId,
    role: 'user',
    text: payload.text,
    createdAtIso: payload.nowIso,
    pendingSync: false,
  };

  const loadingState: ChatScreenState = {
    ...state,
    streaming: true,
    pendingReplyToMessageId: null,
    messages: [...state.messages, userMessage],
  };

  const result = await payload.pipeline.run({
    conversationId: state.conversationId,
    text: payload.text,
    attachments,
  });

  const assistantChunks = (result.chunks ?? [result.text]).filter((chunk) => chunk.trim().length > 0);
  const assistantMessages = assistantChunks.map((chunk) => ({
    id: makeId('mobile-message'),
    conversationId: state.conversationId,
    role: 'assistant' as const,
    text: chunk,
    createdAtIso: payload.nowIso,
    pendingSync: false,
  }));

  return {
    ...loadingState,
    streaming: false,
    messages: [...loadingState.messages, ...assistantMessages],
  };
};
