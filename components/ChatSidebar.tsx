
/**
 * @file ChatSidebar.tsx
 * @description Clean, minimalist sidebar focused on chat sessions.
 */
import React, { useState, useMemo, useCallback } from 'react';
import { ChatSession } from '../types';
import {
  Plus,
  Search,
  MoreHorizontal,
  Trash2,
  Sparkles,
  Settings,
  PanelLeftClose,
  MessageSquare,
  Video,
  LogOut
} from './Icons';

interface ChatSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: ChatSession[];
  currentSessionId: string;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onDeleteSession: (id: string) => void;
  isDarkMode: boolean;
  userEmail?: string;
  onLogout: () => void;
  onOpenSettings: () => void;
  onOpenVideoCall?: () => void;
  currentAshimSession?: { title: string } | null;
  onNewSession?: () => void;
  // Extended System Tools (Optional props kept for type compatibility but not rendered)
  onOpenVoiceLab?: () => void;
  onOpenBranching?: () => void;
  onOpenDreams?: () => void;
  onOpenOracle?: () => void;
  onOpenMemoryPalace?: () => void;
  onOpenDNAVault?: () => void;
  onOpenVerification?: () => void;
}

const ChatSidebar: React.FC<ChatSidebarProps> = ({
  isOpen,
  onClose,
  sessions,
  currentSessionId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
  userEmail,
  onOpenSettings,
  onOpenVideoCall,
  onLogout,
  currentAshimSession,
  onNewSession
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [hoveredSessionId, setHoveredSessionId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const groupedSessions = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const last7Days = new Date(today);
    last7Days.setDate(last7Days.getDate() - 7);
    const groups: Record<string, ChatSession[]> = {
      Today: [],
      Yesterday: [],
      'Previous 7 Days': [],
      Older: [],
    };
    const sorted = [...sessions].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    sorted
      .filter((s) => (s.title || '').toLowerCase().includes(searchTerm.toLowerCase()))
      .forEach((s) => {
        const d = new Date(s.timestamp);
        if (d >= today) groups.Today.push(s);
        else if (d >= yesterday) groups.Yesterday.push(s);
        else if (d >= last7Days) groups['Previous 7 Days'].push(s);
        else groups.Older.push(s);
      });
    return groups;
  }, [sessions, searchTerm]);

  const handleSelectSession = useCallback(
    (id: string) => {
      onSelectSession(id);
      if (window.innerWidth < 768) onClose();
    },
    [onSelectSession, onClose]
  );

  return (
    <>
      {/* Mobile overlay */}
      <div
        className={`
          fixed inset-0 z-40 md:hidden
          transition-opacity duration-300
          bg-black/50 backdrop-blur-sm
          ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}
        `}
        onClick={onClose}
      />
      {/* Sidebar shell */}
      <aside
        className={`
          fixed top-0 left-0 bottom-0 z-50
          w-[280px]
          transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
          bg-surface border-r border-stroke/50
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="p-4 border-b border-stroke/50">
            <div className="flex items-center justify-between mb-4">
               <h1 className="text-xl font-bold font-display text-ink flex items-center gap-2">
                 <Sparkles className="text-accent" size={20} />
                 Ashim
               </h1>
               <button 
                 onClick={onClose} 
                 className="p-2 rounded-xl text-muted hover:text-ink hover:bg-surface2 transition-all cursor-pointer"
                 title="Close Sidebar"
                 type="button"
               >
                 <PanelLeftClose size={20} />
               </button>
            </div>

            <button
                onClick={onNewChat}
                className="w-full flex items-center justify-center gap-2 py-3 bg-accent/10 hover:bg-accent/20 text-accent rounded-xl transition-all font-medium mb-3"
            >
                <Plus size={18} />
                <span>New Chat</span>
            </button>

            <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-surface2 border border-stroke/50 rounded-lg text-sm focus:outline-none focus:border-accent/50 transition-all"
                />
            </div>
          </div>

          {/* Chat List */}
          <div className="flex-1 overflow-y-auto p-2">
            {sessions.length === 0 ? (
                <div className="text-center py-10 opacity-50">
                    <MessageSquare size={32} className="mx-auto mb-2" />
                    <p className="text-xs">No conversations yet</p>
                </div>
            ) : (
                Object.entries(groupedSessions).map(([group, groupSessions]) => {
                    const sessionList = groupSessions as ChatSession[];
                    return sessionList.length > 0 && (
                        <div key={group} className="mb-4">
                            <h3 className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted opacity-70">
                                {group}
                            </h3>
                            <div className="space-y-0.5">
                                {sessionList.map(s => {
                                    const isActive = s.id === currentSessionId;
                                    return (
                                        <div 
                                            key={s.id}
                                            onClick={() => handleSelectSession(s.id)}
                                            onMouseEnter={() => setHoveredSessionId(s.id)}
                                            onMouseLeave={() => { setHoveredSessionId(null); setMenuOpenId(null); }}
                                            className={`
                                                relative group flex items-center gap-3 px-3 py-3 rounded-lg cursor-pointer transition-all
                                                ${isActive ? 'bg-accent/10 text-accent-dark' : 'hover:bg-surface2 text-ink'}
                                            `}
                                        >
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isActive ? 'bg-accent text-white' : 'bg-surface2 text-muted'}`}>
                                                <span className="text-xs font-bold">{s.title?.[0] || 'C'}</span>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className={`text-sm font-medium truncate ${isActive ? 'text-accent' : ''}`}>
                                                    {s.title || 'New Conversation'}
                                                </div>
                                                <div className="text-[11px] text-muted truncate">
                                                    {new Date(s.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                </div>
                                            </div>

                                            {(hoveredSessionId === s.id || isActive) && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === s.id ? null : s.id); }}
                                                    className="p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-muted transition-colors"
                                                >
                                                    <MoreHorizontal size={16} />
                                                </button>
                                            )}

                                            {menuOpenId === s.id && (
                                                <div className="absolute right-2 top-8 w-32 bg-surface border border-stroke shadow-xl rounded-lg z-50 overflow-hidden py-1 animate-scale-in">
                                                    <button onClick={(e) => { e.stopPropagation(); onDeleteSession(s.id); }} className="w-full text-left px-3 py-2 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2">
                                                        <Trash2 size={12} /> Delete
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })
            )}
          </div>

          {/* Footer */}
          <div className="p-3 border-t border-stroke/50 space-y-1">
             <button onClick={onOpenSettings} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface2 text-sm text-ink/80 transition-colors">
                <Settings size={18} />
                <span>Settings</span>
             </button>
             {onOpenVideoCall && (
                 <button onClick={onOpenVideoCall} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface2 text-sm text-ink/80 transition-colors">
                    <Video size={18} />
                    <span>Video Call</span>
                 </button>
             )}
             <button onClick={onLogout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/10 text-sm text-red-500 transition-colors">
                <LogOut size={18} />
                <span>Log Out</span>
             </button>
          </div>
        </div>
      </aside>
    </>
  );
};

export default ChatSidebar;
