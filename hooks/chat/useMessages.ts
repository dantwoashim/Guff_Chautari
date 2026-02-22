
import { useState, useRef, useCallback } from 'react';
import { Message } from '../../types';
import { supabase } from '../../lib/supabase';

export const useMessages = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [visibleCount, setVisibleCount] = useState(50);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const addMessage = useCallback((message: Message) => {
    setMessages(prev => [...prev, message]);
  }, []);

  const updateMessage = useCallback((id: string, updates: Partial<Message>) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
  }, []);

  // Legacy: Save all messages at once
  const saveMessages = useCallback(async (sessionId: string, newMessages: Message[]) => {
    try {
      await supabase.from('chats').update({
        messages: newMessages,
        updated_at: new Date().toISOString()
      }).eq('id', sessionId);
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
      // 1. Append message to chats.messages JSONB array
      const { error: appendError } = await supabase.rpc('append_chat_message', {
        p_chat_id: chatId,
        p_message: message
      });

      if (appendError) {
        // Fallback: If RPC doesn't exist, use traditional update
        console.warn('append_chat_message RPC failed, using fallback:', appendError);
        await supabase.from('chats').update({
          messages: [...messages, message],
          updated_at: new Date().toISOString()
        }).eq('id', chatId);
      }

      // 2. Update conversation preview
      await supabase.from('conversations').update({
        last_message_text: message.text?.slice(0, 100) || '[media]',
        last_message_at: new Date().toISOString()
      }).eq('id', conversationId);

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
