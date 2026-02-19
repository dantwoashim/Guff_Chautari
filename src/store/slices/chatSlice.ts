import { StateCreator } from 'zustand';
import { AppStore, ChatSlice } from '../types';

const DEFAULT_CHAT_CONFIG = {
  systemInstruction: '',
  model: 'gemini-3-pro-preview',
  thinkingBudget: 5,
  temperature: 0.7,
};

export const createChatSlice: StateCreator<AppStore, [], [], ChatSlice> = (set) => ({
  activeThreadId: null,
  threads: [],
  messagesByThread: {},
  typingState: {},
  isConversationLoading: false,
  chatConfig: DEFAULT_CHAT_CONFIG,

  setActiveThreadId: (activeThreadId) => set({ activeThreadId }),
  setThreads: (threads) => set({ threads }),
  upsertThread: (thread) =>
    set((state) => {
      const index = state.threads.findIndex((item) => item.id === thread.id);
      if (index === -1) {
        return { threads: [thread, ...state.threads] };
      }
      const next = [...state.threads];
      next[index] = thread;
      return { threads: next };
    }),
  setThreadMessages: (threadId, messages) =>
    set((state) => ({
      messagesByThread: {
        ...state.messagesByThread,
        [threadId]: messages,
      },
    })),
  appendThreadMessage: (threadId, message) =>
    set((state) => ({
      messagesByThread: {
        ...state.messagesByThread,
        [threadId]: [...(state.messagesByThread[threadId] || []), message],
      },
    })),
  updateThreadMessage: (threadId, messageId, updates) =>
    set((state) => ({
      messagesByThread: {
        ...state.messagesByThread,
        [threadId]: (state.messagesByThread[threadId] || []).map((message) =>
          message.id === messageId ? { ...message, ...updates } : message
        ),
      },
    })),
  setTypingState: (threadId, isTyping) =>
    set((state) => ({
      typingState: {
        ...state.typingState,
        [threadId]: isTyping,
      },
    })),
  setConversationLoading: (isConversationLoading) => set({ isConversationLoading }),
  setChatConfig: (chatConfig) => set({ chatConfig }),
  patchChatConfig: (updates) =>
    set((state) => ({
      chatConfig: {
        ...state.chatConfig,
        ...updates,
      },
    })),
});
