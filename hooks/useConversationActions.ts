
import { useState } from 'react';
import { conversationRepository } from '../src/data/repositories';

export const useConversationActions = () => {
  const [isProcessing, setIsProcessing] = useState(false);

  const toggleArchive = async (conversationId: string, currentStatus: boolean) => {
    setIsProcessing(true);
    try {
      await conversationRepository.updateFlags(conversationId, { is_archived: !currentStatus });
    } catch (error) {
      console.error('Error toggling archive:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleMute = async (conversationId: string, currentStatus: boolean) => {
    setIsProcessing(true);
    try {
      await conversationRepository.updateFlags(conversationId, { is_muted: !currentStatus });
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
      await conversationRepository.updateFlags(conversationId, { is_pinned: !currentStatus });
    } catch (error) {
      console.error('Error toggling pin:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const markUnread = async (conversationId: string) => {
    setIsProcessing(true);
    try {
      await conversationRepository.updateFlags(conversationId, { unread_count: 1 });
    } catch (error) {
      console.error('Error marking unread:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const executeDelete = async (conversationId: string) => {
    setIsProcessing(true);
    try {
      await conversationRepository.deleteConversation(conversationId);
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
