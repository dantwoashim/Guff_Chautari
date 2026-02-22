import React from 'react';
import { Pin, VolumeX } from '../Icons';

interface ConversationItemProps {
  id: string;
  personaId: string;
  personaName: string;
  personaAvatar?: string;
  lastMessage?: string;
  lastMessageAt?: string | number | null;
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
  if (!timestamp) return 'New';
  const date = new Date(timestamp);
  const now = new Date();

  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
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
  isOnline,
  isTyping,
  onClick,
  onContextMenu,
}) => {
  return (
    <button
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`w-full text-left p-3 rounded-xl border transition-all glass-strip ${
        isSelected
          ? 'border-[color:rgba(108,199,255,0.58)] bg-[color:rgba(24,56,87,0.78)]'
          : 'border-transparent hover:border-[color:var(--color-border)] hover:bg-[color:rgba(16,35,57,0.72)]'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="relative shrink-0 h-11 w-11 rounded-full overflow-hidden bg-[color:rgba(25,48,73,0.92)] border border-[color:var(--color-border)]">
          {personaAvatar ? (
            <img src={personaAvatar} alt={personaName} className="h-full w-full object-cover" />
          ) : (
            <span className="h-full w-full inline-flex items-center justify-center text-[15px] font-semibold text-[color:var(--color-text)]">
              {personaName[0] || '?'}
            </span>
          )}
          {isOnline ? (
            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-[color:var(--color-success)] border border-[color:var(--color-bg)]" />
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold text-[color:var(--color-text)] truncate">{personaName}</h3>
            <span className="text-[11px] text-[color:var(--color-text-soft)] shrink-0">{formatTime(lastMessageAt)}</span>
          </div>

          <div className="mt-1 flex items-center justify-between gap-2">
            <p className="text-xs text-[color:var(--color-text-muted)] truncate">
              {isTyping ? 'Typing...' : lastMessage || 'Start a conversation'}
            </p>

            <div className="shrink-0 flex items-center gap-1.5">
              {isPinned ? <Pin size={12} className="text-[color:var(--color-text-soft)]" /> : null}
              {isMuted ? <VolumeX size={12} className="text-[color:var(--color-text-soft)]" /> : null}
              {unreadCount > 0 ? (
                <span className="inline-flex min-w-5 h-5 px-1 items-center justify-center rounded-full text-[11px] font-bold bg-[color:var(--color-accent)] text-[#001321]">
                  {unreadCount}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </button>
  );
};

export default ConversationItem;
