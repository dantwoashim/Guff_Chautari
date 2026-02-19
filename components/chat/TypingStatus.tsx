
import React, { useEffect, useState } from 'react';

interface TypingStatusProps {
  isTyping: boolean;
  isOnline?: boolean;
}

const TypingStatus: React.FC<TypingStatusProps> = ({ isTyping, isOnline = true }) => {
  const [showTyping, setShowTyping] = useState(false);

  useEffect(() => {
    if (isTyping) {
      setShowTyping(true);
    } else {
      // Add a tiny debounce to prevent flickering if toggling rapidly
      const timer = setTimeout(() => setShowTyping(false), 200);
      return () => clearTimeout(timer);
    }
  }, [isTyping]);

  if (showTyping) {
    return (
      <span className="text-[12px] text-accent font-semibold flex items-center gap-1 animate-fade-in">
        typing
        <span className="flex gap-0.5 pt-1">
          <span className="w-1 h-1 bg-accent rounded-full animate-bounce [animation-duration:0.6s]" />
          <span className="w-1 h-1 bg-accent rounded-full animate-bounce [animation-delay:0.1s] [animation-duration:0.6s]" />
          <span className="w-1 h-1 bg-accent rounded-full animate-bounce [animation-delay:0.2s] [animation-duration:0.6s]" />
        </span>
      </span>
    );
  }

  if (isOnline) {
    return (
      <span className="text-[12px] text-muted flex items-center gap-1.5 animate-fade-in font-medium">
        Online
      </span>
    );
  }

  return (
    <span className="text-[12px] text-muted flex items-center gap-1.5">
      Last seen recently
    </span>
  );
};

export default TypingStatus;
