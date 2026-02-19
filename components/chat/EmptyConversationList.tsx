
import React from 'react';
import { MessageSquare } from '../Icons';

interface EmptyConversationListProps {
    onNewChat: () => void;
}

const EmptyConversationList: React.FC<EmptyConversationListProps> = ({ onNewChat }) => {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center animate-fade-in">
      <div className="w-16 h-16 rounded-full bg-[#202c33] flex items-center justify-center mb-4 text-[#8696a0]">
        <MessageSquare size={32} />
      </div>
      <h3 className="text-[#e9edef] text-[16px] font-medium mb-2">No chats yet</h3>
      <p className="text-[#8696a0] text-[14px] mb-6 max-w-xs leading-relaxed">
        Select a persona to start chatting and building a connection.
      </p>
      <button 
        onClick={onNewChat}
        className="bg-[#00a884] hover:bg-[#008f72] text-[#111b21] px-6 py-2.5 rounded-full text-sm font-bold transition-all shadow-lg hover:shadow-[#00a884]/20"
      >
        Start Chat
      </button>
    </div>
  );
};

export default EmptyConversationList;
