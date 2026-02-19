
import { useState, useRef, useCallback, type SetStateAction } from 'react';
import { Message } from '../../types';
import { useAppStore } from '../../src/store';
import { messageRepository } from '../../src/data/repositories';

export const useMessages = (activeThreadId: string | null) => {
  const messages = useAppStore((state) =>
    activeThreadId ? state.messagesByThread[activeThreadId] || [] : []
  );
  const setThreadMessages = useAppStore((state) => state.setThreadMessages);
  const appendThreadMessage = useAppStore((state) => state.appendThreadMessage);
  const updateThreadMessageInStore = useAppStore((state) => state.updateThreadMessage);

  const [visibleCount, setVisibleCount] = useState(50);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const setMessages = useCallback(
    (value: SetStateAction<Message[]>) => {
      if (!activeThreadId) return;
      const nextMessages = typeof value === 'function' ? value(messages) : value;
      setThreadMessages(activeThreadId, nextMessages);
    },
    [activeThreadId, messages, setThreadMessages]
  );

  const addMessage = useCallback((message: Message) => {
    if (!activeThreadId) return;
    appendThreadMessage(activeThreadId, message);
  }, [activeThreadId, appendThreadMessage]);

  const updateMessage = useCallback((id: string, updates: Partial<Message>) => {
    if (!activeThreadId) return;
    updateThreadMessageInStore(activeThreadId, id, updates);
  }, [activeThreadId, updateThreadMessageInStore]);

  // Legacy: Save all messages at once
  const saveMessages = useCallback(async (sessionId: string, newMessages: Message[]) => {
    try {
      await messageRepository.saveMessages(sessionId, newMessages);
    } catch (e) {
      console.error("Failed to save messages", e);
    }
  }, []);

  // NEW: Save a single message immediately (per-message auto-save)
  const saveMessageImmediately = useCallback(async (
    chatId: string,
    message: Message,
    conversationId: string
  ) => {
    try {
      await messageRepository.upsertMessage(chatId, message, {
        fallbackMessages: messages,
      });
      await messageRepository.updateConversationPreview(conversationId, message);

    } catch (e) {
      console.error('Failed to save message immediately:', e);
    }
  }, [messages]);

  const loadMore = useCallback(() => {
    setVisibleCount(prev => prev + 50);
  }, []);

  // Return the slice of messages to render
  const visibleMessages = messages.slice(-visibleCount);
  const hasMore = messages.length > visibleCount;

  return {
    messages, // Full history (for context)
    visibleMessages, // Rendered history
    hasMore,
    loadMore,
    setMessages,
    addMessage,
    updateMessage,
    saveMessages,
    saveMessageImmediately, // NEW: Per-message save
    messagesEndRef
  };
};
