import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Command,
  History,
  Maximize,
  Minimize,
  MoreHorizontal,
  PanelLeft,
  PanelLeftClose,
  Search,
  Video,
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
  onShowHistory?: () => void;
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
  onShowHistory,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, []);

  return (
    <header className="h-[72px] px-4 md:px-5 border-b border-[color:var(--color-border)] flex items-center justify-between gap-3 bg-[color:rgba(10,20,32,0.74)] backdrop-blur-xl">
      <div className="flex items-center gap-3 min-w-0">
        {onBack ? (
          <button
            onClick={onBack}
            className="premium-button md:hidden h-9 w-9 inline-flex items-center justify-center"
            title="Back"
            aria-label="Back"
          >
            <ArrowLeft size={16} />
          </button>
        ) : null}

        {toggleChatList ? (
          <button
            onClick={toggleChatList}
            className="premium-button h-9 w-9 inline-flex items-center justify-center"
            title={isChatListOpen ? 'Hide context rail' : 'Show context rail'}
            aria-label={isChatListOpen ? 'Hide context rail' : 'Show context rail'}
          >
            {isChatListOpen ? <PanelLeftClose size={16} /> : <PanelLeft size={16} />}
          </button>
        ) : null}

        <div className="relative h-11 w-11 rounded-full overflow-hidden border border-[color:var(--color-border)] bg-[color:rgba(20,42,66,0.92)] shrink-0">
          {persona?.avatar_url ? (
            <img src={persona.avatar_url} alt={persona.name} className="w-full h-full object-cover" />
          ) : (
            <span className="w-full h-full inline-flex items-center justify-center text-sm font-semibold text-[color:var(--color-text)]">
              {(persona?.name || 'A')[0]}
            </span>
          )}
        </div>

        <div className="min-w-0">
          <h1 className="text-sm font-semibold text-[color:var(--color-text)] truncate">
            {persona?.name || 'Ashim'}
          </h1>
          <p className={`text-xs ${isTyping ? 'text-[color:var(--color-accent)]' : 'text-[color:var(--color-text-muted)]'}`}>
            {isTyping ? 'Generating response...' : persona?.status_text || 'Ready for conversation'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2" ref={menuRef}>
        {onShowHistory ? (
          <button
            onClick={onShowHistory}
            className="premium-button h-9 w-9 inline-flex items-center justify-center"
            title="Conversation history"
            aria-label="Conversation history"
          >
            <History size={16} />
          </button>
        ) : null}

        <button
          className="premium-button h-9 w-9 inline-flex items-center justify-center"
          title="Search"
          aria-label="Search"
        >
          <Search size={16} />
        </button>

        <button
          onClick={onOpenVideoCall}
          className="premium-button h-9 w-9 inline-flex items-center justify-center"
          title="Video"
          aria-label="Open video mode"
        >
          <Video size={16} />
        </button>

        {toggleFullscreen ? (
          <button
            onClick={toggleFullscreen}
            className="premium-button h-9 w-9 hidden md:inline-flex items-center justify-center"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
          </button>
        ) : null}

        <button
          onClick={() => setMenuOpen((prev) => !prev)}
          className="premium-button h-9 w-9 inline-flex items-center justify-center"
          title="More"
          aria-label="More actions"
        >
          <MoreHorizontal size={16} />
        </button>

        {menuOpen ? (
          <div className="absolute top-[58px] right-0 w-56 premium-panel p-2 z-30">
            <button
              onClick={() => {
                setMenuOpen(false);
                onNewChat?.();
              }}
              className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-[color:rgba(24,52,82,0.78)]"
            >
              Start new chat
            </button>

            <button
              onClick={() => {
                setMenuOpen(false);
                onShowHistory?.();
              }}
              className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-[color:rgba(24,52,82,0.78)]"
            >
              Open chat history
            </button>

            <button
              onClick={() => setMenuOpen(false)}
              className="w-full text-left px-3 py-2 rounded-lg text-sm text-[color:var(--color-text-muted)] hover:bg-[color:rgba(24,52,82,0.78)] flex items-center gap-2"
            >
              <Command size={14} />
              Use Command Palette (Cmd/Ctrl+K)
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
};

export default ChatHeader;
