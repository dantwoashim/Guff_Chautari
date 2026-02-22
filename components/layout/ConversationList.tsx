import React, { useMemo, useState } from 'react';
import { Archive, Plus, Search, Settings, Star } from '../Icons';
import type { Conversation, Persona, ChatListNavView } from '../../types';
import ConversationItem from '../chat/ConversationItem';

interface ConversationListProps {
  sessions: Conversation[];
  personas?: Persona[];
  currentSessionId: string | null;
  onSelectSession: (id: string) => void;
  onSelectPersona?: (personaId: string) => void;
  onNewChat: () => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  isLoading?: boolean;
  onRetry?: () => void;
  title?: string;
  onViewArchived?: () => void;
  onOpenSettings?: () => void;
  onNavigate?: (view: ChatListNavView) => void;
}

type FilterOption = 'all' | 'unread' | 'pinned';

const ConversationList: React.FC<ConversationListProps> = ({
  sessions,
  personas = [],
  currentSessionId,
  onSelectSession,
  onSelectPersona,
  onNewChat,
  searchTerm,
  setSearchTerm,
  isLoading,
  onRetry,
  title = 'Chats',
  onViewArchived,
  onOpenSettings,
  onNavigate,
}) => {
  const [filter, setFilter] = useState<FilterOption>('all');

  const hydratedList = useMemo(() => {
    const map = new Map<string, Conversation>();
    sessions.forEach((session) => {
      if (session.persona_id) {
        map.set(session.persona_id, session);
      }
    });

    const merged: Conversation[] = [];

    personas.forEach((persona) => {
      const existing = map.get(persona.id);
      if (existing) {
        merged.push({ ...existing, persona });
      } else {
        merged.push({
          id: `persona-${persona.id}`,
          user_id: '',
          persona_id: persona.id,
          persona,
          created_at: persona.created_at || new Date().toISOString(),
          last_message_at: null,
          last_message_text: persona.status_text || 'Start a conversation',
          unread_count: 0,
          is_pinned: false,
          is_muted: false,
          is_archived: false,
        } as Conversation);
      }
    });

    const query = searchTerm.toLowerCase().trim();
    let visible = query
      ? merged.filter((item) => (item.persona?.name || '').toLowerCase().includes(query))
      : merged;

    if (filter === 'unread') {
      visible = visible.filter((item) => (item.unread_count || 0) > 0);
    }

    if (filter === 'pinned') {
      visible = visible.filter((item) => Boolean(item.is_pinned));
    }

    return [...visible].sort((a, b) => {
      if (a.is_pinned && !b.is_pinned) return -1;
      if (!a.is_pinned && b.is_pinned) return 1;
      const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
      const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
      return bTime - aTime;
    });
  }, [sessions, personas, searchTerm, filter]);

  const archivedView = title.toLowerCase() === 'archived';

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-[color:var(--color-border)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[color:var(--color-text)]">{title}</h2>
            <p className="text-xs text-[color:var(--color-text-muted)] mt-1">
              {hydratedList.length} persona thread{hydratedList.length === 1 ? '' : 's'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onNewChat}
              className="premium-button h-9 w-9 inline-flex items-center justify-center"
              aria-label="New conversation"
              title="New conversation"
            >
              <Plus size={16} />
            </button>

            <button
              onClick={onOpenSettings}
              className="premium-button h-9 w-9 inline-flex items-center justify-center"
              aria-label="Open settings"
              title="Open settings"
            >
              <Settings size={16} />
            </button>
          </div>
        </div>

        <label className="mt-4 block">
          <span className="sr-only">Search conversations</span>
          <span className="relative block">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--color-text-soft)]"
            />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="premium-input pl-9"
              placeholder="Search personas"
            />
          </span>
        </label>

        <div className="flex gap-2 mt-3 overflow-x-auto scroll-premium">
          <button
            onClick={() => setFilter('all')}
            className={`premium-chip ${filter === 'all' ? 'active' : ''}`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('unread')}
            className={`premium-chip ${filter === 'unread' ? 'active' : ''}`}
          >
            Unread
          </button>
          <button
            onClick={() => setFilter('pinned')}
            className={`premium-chip ${filter === 'pinned' ? 'active' : ''}`}
          >
            Pinned
          </button>
          {!archivedView ? (
            <button onClick={onViewArchived} className="premium-chip">
              <Archive size={12} className="inline mr-1" /> Archived
            </button>
          ) : null}
          {onNavigate ? (
            <button onClick={() => onNavigate('starred')} className="premium-chip">
              <Star size={12} className="inline mr-1" /> Starred
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scroll-premium p-2 space-y-1">
        {isLoading ? (
          <div className="p-4 text-sm text-[color:var(--color-text-muted)]">Loading conversations...</div>
        ) : hydratedList.length === 0 ? (
          <div className="premium-panel p-5 m-2">
            <div className="text-sm text-[color:var(--color-text-muted)]">No conversations found.</div>
            {onRetry ? (
              <button onClick={onRetry} className="premium-button mt-3 px-3 py-1.5 text-xs">
                Retry
              </button>
            ) : null}
          </div>
        ) : (
          hydratedList.map((conversation) => {
            const virtual = conversation.id.startsWith('persona-');
            return (
              <ConversationItem
                key={conversation.id}
                id={conversation.id}
                personaId={conversation.persona_id}
                personaName={conversation.persona?.name || 'Unknown Persona'}
                personaAvatar={conversation.persona?.avatar_url}
                lastMessage={conversation.last_message_text}
                lastMessageAt={conversation.last_message_at}
                unreadCount={conversation.unread_count || 0}
                isSelected={
                  conversation.id === currentSessionId ||
                  (virtual && conversation.persona_id === currentSessionId)
                }
                onClick={() => {
                  if (virtual && onSelectPersona) {
                    onSelectPersona(conversation.persona_id);
                    return;
                  }
                  onSelectSession(conversation.id);
                }}
                isPinned={Boolean(conversation.is_pinned)}
                isMuted={Boolean(conversation.is_muted)}
                isOnline={Boolean(conversation.persona?.is_online)}
                isTyping={false}
                onContextMenu={(event) => { event.preventDefault(); }}
              />
            );
          })
        )}
      </div>
    </div>
  );
};

export default ConversationList;
