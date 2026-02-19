
import React, { useEffect, useState } from 'react';
import { generateTypingSequence, createTypingController, TypingState } from '../../services/typingSimulator';

interface TypingIndicatorProps {
  isTyping: boolean;
  personaName?: string;
  userMessageLength?: number;
  estimatedResponseLength?: number;
  mood?: 'excited' | 'normal' | 'tired' | 'upset';
}

const TypingIndicator: React.FC<TypingIndicatorProps> = ({
  isTyping,
  personaName,
  userMessageLength = 50,
  estimatedResponseLength = 100,
  mood = 'normal'
}) => {
  const [typingPhase, setTypingPhase] = useState<TypingState['phase']>('reading');
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!isTyping) {
      setIsVisible(false);
      return;
    }

    // Generate realistic typing sequence
    const sequence = generateTypingSequence(estimatedResponseLength, userMessageLength, mood);
    const controller = createTypingController(sequence, (state) => {
      setTypingPhase(state.phase);
      setIsVisible(state.isTyping || state.phase === 'reading' || state.phase === 'thinking');
    });

    controller.start();
    setIsVisible(true);

    return () => {
      controller.cancel();
    };
  }, [isTyping, userMessageLength, estimatedResponseLength, mood]);

  if (!isTyping || !isVisible) return null;

  // Different visual states based on phase
  const getPhaseContent = () => {
    switch (typingPhase) {
      case 'reading':
        return (
          <div className="flex gap-1 items-center h-2">
            <span className="text-[#8696a0] text-xs animate-pulse">reading...</span>
          </div>
        );
      case 'thinking':
        return (
          <div className="flex gap-1 items-center h-2">
            <span className="w-2 h-2 rounded-full bg-[#8696a0] animate-pulse" />
            <span className="text-[#8696a0] text-xs">thinking</span>
          </div>
        );
      case 'paused':
        return (
          <div className="flex gap-1 items-center h-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#8696a0] opacity-50" />
            <span className="w-1.5 h-1.5 rounded-full bg-[#8696a0] opacity-50" />
            <span className="w-1.5 h-1.5 rounded-full bg-[#8696a0] opacity-50" />
          </div>
        );
      case 'typing':
      default:
        return (
          <div className="flex gap-1 items-center h-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#8696a0] animate-bounce [animation-delay:0ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-[#8696a0] animate-bounce [animation-delay:150ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-[#8696a0] animate-bounce [animation-delay:300ms]" />
          </div>
        );
    }
  };

  return (
    <div className="flex items-center gap-2 p-2 px-4 animate-fade-in">
      <div className="px-4 py-3 bg-[#202c33] rounded-xl rounded-tl-none shadow-sm inline-block">
        {getPhaseContent()}
      </div>
    </div>
  );
};

export default TypingIndicator;
