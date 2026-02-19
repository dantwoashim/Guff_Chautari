
import React from 'react';

interface TypingIndicatorProps {
  isTyping: boolean;
  personaName?: string;
}

const TypingIndicator: React.FC<TypingIndicatorProps> = ({ isTyping, personaName }) => {
  if (!isTyping) return null;
  
  return (
    <div className="flex items-center gap-2 p-2 px-4 animate-fade-in">
      <div className="px-4 py-3 bg-[#202c33] rounded-xl rounded-tl-none shadow-sm inline-block">
        <div className="flex gap-1 items-center h-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#8696a0] animate-bounce [animation-delay:0ms]" />
          <span className="w-1.5 h-1.5 rounded-full bg-[#8696a0] animate-bounce [animation-delay:150ms]" />
          <span className="w-1.5 h-1.5 rounded-full bg-[#8696a0] animate-bounce [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
};

export default TypingIndicator;
