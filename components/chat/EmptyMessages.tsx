import React from 'react';
import { Sparkles } from '../Icons';
import { Persona } from '../../types';

interface EmptyMessagesProps {
  persona: Persona;
  onSendPrompt?: (prompt: string) => void;
}

const EmptyMessages: React.FC<EmptyMessagesProps> = ({ persona, onSendPrompt }) => {
  const prompts = ['What should we solve today?', 'Review my decision plan', 'Give me a strategic summary'];

  return (
    <div className="h-full flex items-center justify-center p-8">
      <div className="premium-panel max-w-xl w-full p-8 text-center">
        <div className="w-16 h-16 mx-auto rounded-2xl border border-[color:var(--color-border)] bg-[color:rgba(22,44,70,0.85)] flex items-center justify-center text-[color:var(--color-accent)]">
          <Sparkles size={26} />
        </div>

        <h2 className="mt-5 text-2xl font-semibold text-[color:var(--color-text)]">
          {persona?.name || 'Ashim'}
        </h2>

        <p className="mt-2 text-sm text-[color:var(--color-text-muted)] leading-relaxed">
          {persona?.description || persona?.status_text || 'Begin a high-context conversation from here.'}
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {prompts.map((prompt) => (
            <button
              key={prompt}
              onClick={() => onSendPrompt?.(prompt)}
              className="premium-chip"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default EmptyMessages;
