
import React from 'react';
import { AlertTriangle, RefreshCw } from '../Icons';

const ConversationListError: React.FC<{onRetry: () => void}> = ({ onRetry }) => (
  <div className="flex flex-col items-center justify-center h-40 p-4 text-center animate-fade-in">
    <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center mb-3">
        <AlertTriangle className="w-5 h-5 text-red-400" />
    </div>
    <p className="text-[#e9edef] text-sm mb-3">Couldn't load chats</p>
    <button 
      onClick={onRetry}
      className="flex items-center gap-2 text-[#00a884] text-xs font-bold hover:underline uppercase tracking-wide"
    >
      <RefreshCw size={12} />
      Tap to retry
    </button>
  </div>
);

export default ConversationListError;
