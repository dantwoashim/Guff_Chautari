
import { useState, useCallback, useEffect, useRef } from 'react';

interface UseTypingIndicatorOptions {
  conversationId: string;
  onTypingChange?: (isTyping: boolean) => void;
}

export const useTypingIndicator = ({
  conversationId,
  onTypingChange
}: UseTypingIndicatorOptions) => {
  const [isPersonaTyping, setIsPersonaTyping] = useState(false);
  const [isUserTyping, setIsUserTyping] = useState(false);
  
  const personaTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const MAX_PERSONA_TYPING_DURATION = 30000; // 30s failsafe
  const USER_TYPING_DEBOUNCE = 3000; // 3s stop delay

  // Start typing indicator when AI is processing
  const startPersonaTyping = useCallback(() => {
    setIsPersonaTyping(true);
    
    // Clear existing failsafe
    if (personaTypingTimeoutRef.current) {
        clearTimeout(personaTypingTimeoutRef.current);
    }

    // Failsafe: auto-stop after 30 seconds
    personaTypingTimeoutRef.current = setTimeout(() => {
      setIsPersonaTyping(false);
      // console.warn('[TypingIndicator] Timed out after 30s');
    }, MAX_PERSONA_TYPING_DURATION);
  }, []);

  const stopPersonaTyping = useCallback(() => {
    setIsPersonaTyping(false);
    if (personaTypingTimeoutRef.current) {
      clearTimeout(personaTypingTimeoutRef.current);
    }
  }, []);

  // Clean up on unmount or conversation change
  useEffect(() => {
    return () => {
      if (personaTypingTimeoutRef.current) clearTimeout(personaTypingTimeoutRef.current);
      if (userTypingTimeoutRef.current) clearTimeout(userTypingTimeoutRef.current);
    };
  }, [conversationId]);

  // User typing debounce
  const handleUserTyping = useCallback(() => {
    if (!isUserTyping) {
      setIsUserTyping(true);
      onTypingChange?.(true);
    }
    
    // Reset timeout on each keystroke
    if (userTypingTimeoutRef.current) {
      clearTimeout(userTypingTimeoutRef.current);
    }
    
    userTypingTimeoutRef.current = setTimeout(() => {
      setIsUserTyping(false);
      onTypingChange?.(false);
    }, USER_TYPING_DEBOUNCE);
  }, [isUserTyping, onTypingChange]);

  return {
    isPersonaTyping,
    isUserTyping,
    startPersonaTyping,
    stopPersonaTyping,
    handleUserTyping,
    setIsPersonaTyping // Allow manual override if needed by streaming logic
  };
};
