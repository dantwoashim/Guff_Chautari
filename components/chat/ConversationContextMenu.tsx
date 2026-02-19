
import React, { useEffect, useRef } from 'react';
import { Archive, Pin, VolumeX, Mail, Trash2, PinOff, Volume2, MailOpen } from '../Icons';

interface ConversationContextMenuProps {
  x: number;
  y: number;
  isPinned: boolean;
  isMuted: boolean;
  hasUnread: boolean;
  onClose: () => void;
  onAction: (action: 'archive' | 'pin' | 'mute' | 'mark_unread' | 'delete') => void;
}

const ConversationContextMenu: React.FC<ConversationContextMenuProps> = ({
  x,
  y,
  isPinned,
  isMuted,
  hasUnread,
  onClose,
  onAction
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Adjust position if close to screen edge
  const adjustedY = y > window.innerHeight - 300 ? y - 220 : y;
  const adjustedX = x > window.innerWidth - 250 ? x - 200 : x;

  return (
    <div
      ref={menuRef}
      className="fixed z-50 w-52 bg-[#233138] rounded-md shadow-xl py-2 flex flex-col border border-[#111b21]/50 text-[#e9edef] animate-scale-in"
      style={{ top: adjustedY, left: adjustedX }}
    >
      <ContextItem 
        label="Archive chat" 
        onClick={() => onAction('archive')} 
        icon={<Archive size={18} />} // Optional: Icon not strictly standard in WA web context menu but helpful
      />
      <ContextItem 
        label={isMuted ? "Unmute notifications" : "Mute notifications"} 
        onClick={() => onAction('mute')} 
        icon={isMuted ? <Volume2 size={18} /> : <VolumeX size={18} />}
      />
      <ContextItem 
        label="Delete chat" 
        onClick={() => onAction('delete')} 
        icon={<Trash2 size={18} />}
      />
      <ContextItem 
        label={isPinned ? "Unpin chat" : "Pin chat"} 
        onClick={() => onAction('pin')} 
        icon={isPinned ? <PinOff size={18} /> : <Pin size={18} />}
      />
      <ContextItem 
        label={hasUnread ? "Mark as read" : "Mark as unread"} 
        onClick={() => onAction('mark_unread')} 
        icon={hasUnread ? <MailOpen size={18} /> : <Mail size={18} />}
      />
    </div>
  );
};

const ContextItem: React.FC<{ label: string; onClick: () => void; icon?: React.ReactNode }> = ({ label, onClick, icon }) => (
  <button
    className="w-full text-left px-6 py-2.5 hover:bg-[#111b21] transition-colors text-[14.5px] leading-5 flex items-center justify-between group"
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
  >
    <span>{label}</span>
    {/* Icons are usually hidden in WA Web context menu unless hovered or not present at all, but we can keep it clean or add them subtle */}
  </button>
);

export default ConversationContextMenu;
