
import React from 'react';
import {
  Reply, Copy, Forward, Pin, Star, Check, Flag, Trash2,
  Smile, Heart, ThumbsUp, ThumbsDown, X, GitBranch
} from './Icons';

interface ChatContextMenuProps {
  x: number;
  y: number;
  isUser: boolean;
  onClose: () => void;
  onReply: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onReact: (emoji: string) => void;
  onPin: () => void;
  onStar: () => void;
  onForward: () => void;
  onSelect: () => void;
  onBranch?: () => void;
  isDarkMode?: boolean;
}

const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

const ChatContextMenu: React.FC<ChatContextMenuProps> = ({
  x, y, isUser, onClose, onReply, onCopy, onDelete, onReact, onPin, onStar, onForward, onSelect, onBranch, isDarkMode
}) => {

  // Adjust position to keep it on screen
  const style: React.CSSProperties = {
    position: 'fixed',
    top: Math.min(y, window.innerHeight - 380),
    left: Math.min(x, window.innerWidth - 220),
    zIndex: 100
  };

  return (
    <>
      <div className="fixed inset-0 z-50" onClick={onClose} />
      <div
        className={`
          absolute z-[100] w-56 rounded-xl overflow-hidden shadow-2xl backdrop-blur-xl border animate-scale-in origin-top-left
          ${isDarkMode ? 'bg-[#1E1E1E]/90 border-white/10 text-white' : 'bg-white/90 border-black/5 text-gray-900'}
        `}
        style={style}
      >
        {/* Reaction Bar */}
        <div className={`flex justify-between px-2 py-3 border-b ${isDarkMode ? 'border-white/10 bg-black/20' : 'border-gray-100 bg-gray-50/50'}`}>
          {REACTIONS.map(emoji => (
            <button
              key={emoji}
              onClick={() => { onReact(emoji); onClose(); }}
              className="p-1.5 hover:scale-125 transition-transform text-xl cursor-pointer"
            >
              {emoji}
            </button>
          ))}
          <button className={`p-1.5 rounded-full ${isDarkMode ? 'bg-white/10 hover:bg-white/20' : 'bg-gray-200 hover:bg-gray-300'}`}>
            <PlusIcon />
          </button>
        </div>

        {/* Menu Items */}
        <div className="py-1.5">
          <MenuItem icon={Reply} label="Reply" onClick={() => { onReply(); onClose(); }} isDarkMode={isDarkMode} />
          <MenuItem icon={Copy} label="Copy" onClick={() => { onCopy(); onClose(); }} isDarkMode={isDarkMode} />
          {onBranch && <MenuItem icon={GitBranch} label="Resume from here" onClick={() => { onBranch(); onClose(); }} isDarkMode={isDarkMode} />}
          <MenuItem icon={Forward} label="Forward" onClick={() => { onForward(); onClose(); }} isDarkMode={isDarkMode} />
          <MenuItem icon={Pin} label="Pin" onClick={() => { onPin(); onClose(); }} isDarkMode={isDarkMode} />
          <MenuItem icon={Star} label="Star" onClick={() => { onStar(); onClose(); }} isDarkMode={isDarkMode} />
          <MenuItem icon={Check} label="Select" onClick={() => { onSelect(); onClose(); }} isDarkMode={isDarkMode} />

          <div className={`h-px my-1.5 mx-3 ${isDarkMode ? 'bg-white/10' : 'bg-gray-100'}`} />

          <MenuItem icon={Flag} label="Report" onClick={() => onClose()} isDarkMode={isDarkMode} />
          <MenuItem icon={Trash2} label="Delete" onClick={() => { onDelete(); onClose(); }} isDarkMode={isDarkMode} isDestructive />
        </div>
      </div>
    </>
  );
};

const MenuItem: React.FC<{
  icon: any,
  label: string,
  onClick: () => void,
  isDarkMode?: boolean,
  isDestructive?: boolean
}> = ({ icon: Icon, label, onClick, isDarkMode, isDestructive }) => (
  <button
    onClick={onClick}
    className={`
      w-full px-4 py-2.5 flex items-center gap-3 text-sm font-medium transition-colors
      ${isDestructive
        ? 'text-red-500 hover:bg-red-500/10'
        : isDarkMode
          ? 'text-gray-200 hover:bg-white/10'
          : 'text-gray-700 hover:bg-gray-100'}
    `}
  >
    <Icon size={18} strokeWidth={2} />
    {label}
  </button>
);

const PlusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"></line>
    <line x1="5" y1="12" x2="19" y2="12"></line>
  </svg>
);

export default ChatContextMenu;
