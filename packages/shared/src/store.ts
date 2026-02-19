import { createStore } from 'zustand/vanilla';
import type { SharedConversation, SharedMessage, SharedPlatform, SharedStoreState } from './types';

export interface SharedStoreActions {
  setActiveConversation: (conversationId: string | null) => void;
  upsertConversation: (conversation: SharedConversation) => void;
  appendMessage: (message: SharedMessage) => void;
  setSyncQueueDepth: (depth: number) => void;
}

export type SharedStore = ReturnType<typeof createSharedStore>;

const defaultState = (platform: SharedPlatform): SharedStoreState => ({
  platform,
  activeConversationId: null,
  conversations: [],
  messagesByConversationId: {},
  syncQueueDepth: 0,
});

export const createSharedStore = (platform: SharedPlatform) => {
  return createStore<SharedStoreState & SharedStoreActions>()((set) => ({
    ...defaultState(platform),
    setActiveConversation: (conversationId) =>
      set(() => ({
        activeConversationId: conversationId,
      })),
    upsertConversation: (conversation) =>
      set((state) => {
        const existing = state.conversations.find((entry) => entry.id === conversation.id);
        return {
          conversations: existing
            ? state.conversations.map((entry) => (entry.id === conversation.id ? conversation : entry))
            : [conversation, ...state.conversations],
        };
      }),
    appendMessage: (message) =>
      set((state) => {
        const existing = state.messagesByConversationId[message.conversationId] ?? [];
        return {
          messagesByConversationId: {
            ...state.messagesByConversationId,
            [message.conversationId]: [...existing, message],
          },
        };
      }),
    setSyncQueueDepth: (depth) =>
      set(() => ({
        syncQueueDepth: Math.max(0, Math.floor(depth)),
      })),
  }));
};
