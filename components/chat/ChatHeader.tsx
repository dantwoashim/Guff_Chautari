
import React, { useState, useRef, useEffect } from 'react';
import {
  Video,
  Phone,
  Search,
  MoreHorizontal,
  ArrowLeft,
  Maximize,
  Minimize,
  PanelLeft,
  PanelLeftClose,
  History,
  Trash2,
  RefreshCw,
  Info,
  MessageSquare
} from '../Icons';
import { Persona } from '../../types';

interface ChatHeaderProps {
  persona: Persona | null;
  isTyping: boolean;
  onOpenVideoCall: () => void;
  onBack?: () => void;
  toggleChatList?: () => void;
  isChatListOpen?: boolean;
  toggleFullscreen?: () => void;
  isFullscreen?: boolean;
  onNewChat?: () => void;
  onShowHistory?: () => void; // NEW: Show chat history with this persona
}

const ChatHeader: React.FC<ChatHeaderProps> = ({
  persona,
  isTyping,
  onOpenVideoCall,
  onBack,
  toggleChatList,
  isChatListOpen,
  toggleFullscreen,
  isFullscreen,
  onNewChat,
  onShowHistory
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const formatLastSeen = (date?: string): string => {
    if (!date) return 'last seen recently';
    const d = new Date(date);
    const now = new Date();
    const diffMins = Math.floor((now.getTime() - d.getTime()) / 60000);

    if (diffMins < 1) return 'last seen just now';
    if (diffMins < 60) return `last seen ${diffMins}m ago`;
    if (diffMins < 1440) return `last seen ${Math.floor(diffMins / 60)}h ago`;
    return `last seen ${d.toLocaleDateString()}`;
  };

  const statusText = isTyping
    ? 'typing...'
    : (persona?.is_online ?? true)
      ? 'Online'
      : formatLastSeen(undefined);

  return (
    <header className="wa-header border-l border-[#313d45] shrink-0 z-20 flex items-center justify-between px-4 py-2.5 bg-[#202c33]">
      <div className="flex items-center gap-3 overflow-hidden">
        {onBack && (
          <button onClick={onBack} className="md:hidden text-[#aebac1] mr-1" title="Go Back">
            <ArrowLeft size={24} />
          </button>
        )}

        {/* Sidebar Toggle Button */}
        {toggleChatList && (
          <button
            onClick={toggleChatList}
            className={`flex items-center justify-center w-9 h-9 rounded-lg transition-all mr-1 ${isChatListOpen
              ? 'text-[#00a884] bg-[#00a884]/10 hover:bg-[#00a884]/20'
              : 'text-[#aebac1] bg-[#2a3942] hover:bg-[#3a4a55]'
              }`}
            title={isChatListOpen ? "Hide Sidebar" : "Show Sidebar"}
          >
            {isChatListOpen ? <PanelLeftClose size={20} /> : <PanelLeft size={20} />}
          </button>
        )}

        {/* Chat History Button - Show past chats with this persona */}
        {onShowHistory && (
          <button
            onClick={onShowHistory}
            className="flex items-center justify-center w-9 h-9 rounded-lg transition-all mr-2 text-[#aebac1] bg-[#2a3942] hover:bg-[#3a4a55] hover:text-[#e9edef]"
            title="Chat History"
          >
            <History size={18} />
          </button>
        )}

        <div className="relative shrink-0 cursor-pointer">
          <div className="w-10 h-10 rounded-full bg-[#6a7175] overflow-hidden flex items-center justify-center">
            {persona?.name ? (
              persona.avatar_url ? (
                <img src={persona.avatar_url} alt={persona.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-xl text-[#cfd4d6]">{persona.name[0]}</span>
              )
            ) : (
              <span className="text-xl text-[#cfd4d6]">?</span>
            )}
          </div>
        </div>

        <div className="flex flex-col justify-center min-w-0 cursor-pointer">
          <h2 className="text-[#e9edef] text-[16px] leading-tight font-medium truncate">
            {persona?.name || 'Ashim'}
          </h2>
          <span className={`text-[13px] leading-tight truncate transition-colors duration-200 ${isTyping ? 'text-[#00a884] font-medium' : 'text-[#8696a0]'}`}>
            {statusText}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0 relative">
        {toggleFullscreen && (
          <button onClick={toggleFullscreen} className="text-[#aebac1] hover:text-[#e9edef] p-2 rounded-full transition-colors hidden sm:block" title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}>
            {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
          </button>
        )}

        <button className="text-[#aebac1] hover:text-[#e9edef] p-2 rounded-full transition-colors" onClick={onOpenVideoCall} title="Video Call">
          <Video size={20} />
        </button>
        <button className="text-[#aebac1] hover:text-[#e9edef] p-2 rounded-full transition-colors" title="Voice Call">
          <Phone size={20} />
        </button>
        <div className="w-px h-6 bg-[#313d45] mx-1 hidden sm:block" />
        <button className="text-[#aebac1] hover:text-[#e9edef] p-2 rounded-full transition-colors hidden sm:block">
          <Search size={20} />
        </button>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className={`text-[#aebac1] hover:text-[#e9edef] p-2 rounded-full transition-colors ${isMenuOpen ? 'bg-[#2a3942]' : ''}`}
          >
            <MoreHorizontal size={20} />
          </button>

          {isMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-48 bg-[#233138] rounded-md shadow-xl py-2 border border-[#111b21]/50 z-50 animate-scale-in origin-top-right">
              {onNewChat && (
                <>
                  <button
                    onClick={() => { setIsMenuOpen(false); onNewChat(); }}
                    className="w-full px-4 py-2.5 text-left text-[14.5px] text-[#e9edef] hover:bg-[#111b21] transition-colors flex items-center gap-3"
                  >
                    <MessageSquare size={16} /> Start New Chat
                  </button>
                  <div className="h-px bg-[#313d45] my-1 opacity-50" />
                </>
              )}
              <button className="w-full px-4 py-2.5 text-left text-[14.5px] text-[#e9edef] hover:bg-[#111b21] transition-colors flex items-center gap-3">
                <Info size={16} /> Contact Info
              </button>
              <button className="w-full px-4 py-2.5 text-left text-[14.5px] text-[#e9edef] hover:bg-[#111b21] transition-colors flex items-center gap-3">
                <RefreshCw size={16} /> Clear messages
              </button>
              <div className="h-px bg-[#313d45] my-1 opacity-50" />
              <button className="w-full px-4 py-2.5 text-left text-[14.5px] text-red-400 hover:bg-[#111b21] transition-colors flex items-center gap-3">
                <Trash2 size={16} /> Delete chat
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default ChatHeader;
