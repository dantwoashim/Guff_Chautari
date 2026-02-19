
import React from 'react';
import { Pin, VolumeX, ChevronDown } from '../Icons';

interface ConversationItemProps {
  id: string;
  personaId: string;
  personaName: string;
  personaAvatar?: string;
  lastMessage?: string;
  lastMessageAt?: string | number | null; // Allow null
  unreadCount: number;
  isPinned: boolean;
  isMuted: boolean;
  isSelected: boolean;
  isOnline: boolean;
  isTyping: boolean;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

const formatTime = (timestamp: string | number | null | undefined): string => {
    if (!timestamp) return ''; // Return empty string for new contacts
    const date = new Date(timestamp);
    const now = new Date();
    
    // If today
    if (date.toDateString() === now.toDateString()) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    }
    // If yesterday
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
        return 'Yesterday';
    }
    // Older
    return date.toLocaleDateString([], { month: '2-digit', day: '2-digit', year: '2-digit' });
};

const ConversationItem: React.FC<ConversationItemProps> = ({
  personaName,
  personaAvatar,
  lastMessage,
  lastMessageAt,
  unreadCount,
  isPinned,
  isMuted,
  isSelected,
  onClick,
  onContextMenu
}) => {
  return (
    <div
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`
        wa-conversation-item group flex items-center px-3 h-[72px] cursor-pointer relative
        ${isSelected ? 'selected' : ''}
        ${unreadCount > 0 ? 'unread' : ''}
      `}
    >
      {/* Avatar */}
      <div className="shrink-0 mr-3">
        <div className="w-[49px] h-[49px] rounded-full bg-[#6a7175] overflow-hidden flex items-center justify-center">
            {personaAvatar ? (
                <img src={personaAvatar} alt="" className="w-full h-full object-cover" />
            ) : (
                <span className="text-[#cfd4d6] text-xl font-medium">{personaName?.[0] || '?'}</span>
            )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col justify-center h-full border-b border-[#202c33]/50 pr-1">
        <div className="flex justify-between items-baseline mb-0.5">
            <h3 className="text-[#e9edef] text-[17px] font-normal truncate max-w-[70%]">
                {personaName}
            </h3>
            <span className={`text-[12px] ${unreadCount > 0 ? 'text-[#00a884] font-medium' : 'text-[#8696a0]'}`}>
                {formatTime(lastMessageAt)}
            </span>
        </div>
        
        <div className="flex justify-between items-center">
            <p className="text-[#8696a0] text-[14px] truncate max-w-[85%] leading-5">
                {lastMessage || 'Start a conversation'}
            </p>
            
            <div className="flex items-center gap-1">
                {isPinned && <Pin size={14} className="text-[#8696a0] rotate-45" />}
                {isMuted && <VolumeX size={14} className="text-[#8696a0]" />}
                {unreadCount > 0 && (
                    <div className="bg-[#00a884] text-[#111b21] text-[12px] font-bold h-5 min-w-[20px] px-1 rounded-full flex items-center justify-center">
                        {unreadCount}
                    </div>
                )}
                {/* Hover Chevron */}
                <button className={`hidden group-hover:block p-1 text-[#8696a0] hover:text-[#e9edef] ${isSelected ? 'block' : ''}`}>
                    <ChevronDown size={16} />
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default ConversationItem;
