
import { useState } from 'react';
import { supabase } from '../lib/supabase';

export const useConversationActions = () => {
  const [isProcessing, setIsProcessing] = useState(false);

  const toggleArchive = async (conversationId: string, currentStatus: boolean) => {
    setIsProcessing(true);
    try {
      const { error } = await supabase
        .from('conversations')
        .update({ is_archived: !currentStatus })
        .eq('id', conversationId);
      
      if (error) throw error;
    } catch (error) {
      console.error('Error toggling archive:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleMute = async (conversationId: string, currentStatus: boolean) => {
    setIsProcessing(true);
    try {
      const { error } = await supabase
        .from('conversations')
        .update({ is_muted: !currentStatus })
        .eq('id', conversationId);
      
      if (error) throw error;
    } catch (error) {
      console.error('Error toggling mute:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const togglePin = async (conversationId: string, currentStatus: boolean, currentPinnedCount: number) => {
    if (!currentStatus && currentPinnedCount >= 3) {
      alert('You can only pin up to 3 chats.');
      return;
    }

    setIsProcessing(true);
    try {
      const { error } = await supabase
        .from('conversations')
        .update({ is_pinned: !currentStatus })
        .eq('id', conversationId);
      
      if (error) throw error;
    } catch (error) {
      console.error('Error toggling pin:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const markUnread = async (conversationId: string) => {
    setIsProcessing(true);
    try {
      const { error } = await supabase
        .from('conversations')
        .update({ unread_count: 1 }) // Simple toggle logic could be more complex
        .eq('id', conversationId);
      
      if (error) throw error;
    } catch (error) {
      console.error('Error marking unread:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const executeDelete = async (conversationId: string) => {
    setIsProcessing(true);
    try {
      // Cascading delete should handle messages if configured in DB, otherwise manual delete might be needed
      // Assuming DB foreign keys set to CASCADE
      const { error } = await supabase
        .from('conversations')
        .delete()
        .eq('id', conversationId);
      
      if (error) throw error;
    } catch (error) {
      console.error('Error deleting chat:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  return { 
    toggleArchive, 
    toggleMute, 
    togglePin, 
    markUnread, 
    executeDelete,
    isProcessing 
  };
};
