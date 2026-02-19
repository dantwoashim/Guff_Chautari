
import React from 'react';
import { Persona } from '../../types';

interface EmptyMessagesProps {
  persona: Persona;
  onSendPrompt?: (prompt: string) => void;
}

const EmptyMessages: React.FC<EmptyMessagesProps> = ({ 
  persona, 
  onSendPrompt 
}) => {
  const suggestedPrompts = [
      "Hello! 👋",
      "How are you doing?",
      "Tell me about yourself"
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[#0b141a]/95 h-full animate-fade-in wa-chat-bg">
      <div className="w-24 h-24 rounded-full overflow-hidden mb-4 bg-[#6a7175] flex items-center justify-center border-4 border-[#202c33] shadow-lg">
        {persona.avatar_url ? (
            <img src={persona.avatar_url} alt={persona.name} className="w-full h-full object-cover" />
        ) : (
            <span className="text-3xl text-[#cfd4d6]">{persona.name?.[0]}</span>
        )}
      </div>
      
      <h2 className="text-xl font-medium text-[#e9edef] mb-2">
        {persona.name}
      </h2>
      
      <p className="text-[#8696a0] text-center max-w-sm mb-8 text-sm leading-relaxed">
        {persona.description || persona.status_text || 'Start a conversation'}
      </p>
      
      <div className="flex flex-wrap gap-2 justify-center max-w-md">
        {suggestedPrompts.map((prompt, i) => (
          <button
            key={i}
            onClick={() => onSendPrompt?.(prompt)}
            className="px-4 py-2 bg-[#202c33] border border-[#2a3942] rounded-full text-sm text-[#e9edef] hover:bg-[#2a3942] transition-colors shadow-sm"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
};

export default EmptyMessages;
