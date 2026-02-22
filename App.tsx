import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from './lib/supabase';
import { useChatLogic } from './hooks/useChatLogic';
import { useIsMobile, useIsTablet } from './hooks/useMediaQuery';
import Auth from './components/Auth';
import SettingsModal from './components/settings/SettingsModal';
import SessionModal from './components/SessionModal';
import DeleteModal from './components/DeleteModal';
import NewChatModal from './components/modals/NewChatModal';
import ViewContainer from './components/ViewContainer';
import SqlSetupInstructions from './components/SqlSetupInstructions';
import AppShell from './components/layout/AppShell';
import IconSidebar from './components/layout/IconSidebar';
import ConversationList from './components/layout/ConversationList';
import ToastNotification from './components/notifications/ToastNotification';
import CommandPalette from './components/layout/CommandPalette';
import AppsLibraryDrawer from './components/layout/AppsLibraryDrawer';
import {
  APPS_LIBRARY_VIEWS,
  getViewsByArea,
  resolveAreaForView,
  VIEW_REGISTRY,
  type PrimaryAreaId,
} from './navigation/viewRegistry';
import type { AppViewId, ChatListNavView } from './types';
import { Command, Library, PanelLeft, PanelLeftClose, Plus, Sparkles } from './components/Icons';
import { useNotificationStore } from './stores/notificationStore';

const App: React.FC = () => {
  const logic = useChatLogic();
  const { state, handlers } = logic;
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();

  const [primaryArea, setPrimaryArea] = useState<PrimaryAreaId>('inbox');
  const [chatListView, setChatListView] = useState<ChatListNavView>('chat');
  const [searchTerm, setSearchTerm] = useState('');
  const [mobileSurface, setMobileSurface] = useState<'context' | 'content'>('context');
  const [contextRailOpen, setContextRailOpen] = useState(true);
  const [commandOpen, setCommandOpen] = useState(false);
  const [appsLibraryOpen, setAppsLibraryOpen] = useState(false);

  const {
    getVisibleNotifications,
    dismiss: dismissNotification,
    markSessionRead,
    setCurrentSession,
  } = useNotificationStore();

  useEffect(() => {
    setCurrentSession(state.currentSessionId);
  }, [setCurrentSession, state.currentSessionId]);

  useEffect(() => {
    setPrimaryArea(resolveAreaForView(state.currentView));
  }, [state.currentView]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
      if (!isShortcut) {
        return;
      }
      event.preventDefault();
      setCommandOpen(true);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const notifications = getVisibleNotifications();

  const handleNotificationNavigate = async (sessionId: string) => {
    handlers.updateCurrentSession(sessionId);
    markSessionRead(sessionId);

    setTimeout(async () => {
      await handlers.refreshMessages?.(sessionId);
    }, 100);

    if (isMobile) {
      setMobileSurface('content');
      setContextRailOpen(false);
    }
  };

  const handlePrimaryAreaChange = (area: PrimaryAreaId) => {
    setPrimaryArea(area);

    const areaViews = getViewsByArea(area);
    const preferred = areaViews.find((entry) => entry.isCore) || areaViews[0];

    if (preferred && preferred.id !== state.currentView) {
      handlers.setCurrentView(preferred.id);
    }

    if (isTablet) {
      setMobileSurface('context');
      setContextRailOpen(true);
    }
  };

  const handleOpenView = (viewId: AppViewId) => {
    handlers.setCurrentView(viewId);
    setPrimaryArea(resolveAreaForView(viewId));
    if (isTablet) {
      setMobileSurface('content');
      setContextRailOpen(false);
    }
  };

  const displayedSessions = useMemo(() => {
    if (chatListView === 'archived') {
      return state.conversations.filter((conversation) => conversation.is_archived);
    }

    if (chatListView === 'starred') {
      return state.conversations.filter((conversation) => conversation.is_pinned && !conversation.is_archived);
    }

    return state.conversations.filter((conversation) => !conversation.is_archived);
  }, [chatListView, state.conversations]);

  const commandItems = useMemo(
    () => [
      {
        id: 'new-chat',
        title: 'Start New Chat',
        description: 'Open persona selector and create a new conversation.',
        keywords: ['chat', 'new', 'conversation'],
        action: () => handlers.handleNewChat(),
      },
      {
        id: 'open-apps-library',
        title: 'Open Apps Library',
        description: 'Browse non-core modules and launch features.',
        keywords: ['apps', 'modules', 'library'],
        action: () => setAppsLibraryOpen(true),
      },
      ...VIEW_REGISTRY.map((entry) => ({
        id: `view-${entry.id}`,
        title: `Go to ${entry.title}`,
        description: entry.description,
        keywords: [entry.category, entry.area],
        action: () => handleOpenView(entry.id),
      })),
    ],
    [handlers, handleOpenView],
  );

  const renderContextRail = () => {
    if (primaryArea === 'inbox') {
      return (
        <ConversationList
          sessions={displayedSessions}
          personas={state.personas}
          currentSessionId={state.currentSessionId}
          onSelectSession={(id) => {
            handlers.updateCurrentSession(id);
            if (isTablet) {
              setMobileSurface('content');
              setContextRailOpen(false);
            }
          }}
          onSelectPersona={async (personaId) => {
            await handlers.handleSelectPersona(personaId, false);
            if (isTablet) {
              setMobileSurface('content');
              setContextRailOpen(false);
            }
          }}
          onNewChat={() => handlers.handleNewChat()}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          isLoading={state.sessionManager.isLoading}
          onRetry={() => handlers.fetchSessions()}
          title={chatListView === 'archived' ? 'Archived' : chatListView === 'starred' ? 'Starred' : 'Chats'}
          onViewArchived={() => setChatListView('archived')}
          onOpenSettings={() => handlers.setIsSettingsOpen(true)}
          onNavigate={setChatListView}
        />
      );
    }

    const areaViews = getViewsByArea(primaryArea);

    return (
      <div className="h-full flex flex-col">
        <div className="p-5 border-b border-[color:var(--color-border)]">
          <h2 className="text-lg font-semibold text-[color:var(--color-text)]">
            {primaryArea.replace('_', ' ').replace(/\b\w/g, (value) => value.toUpperCase())}
          </h2>
          <p className="text-xs text-[color:var(--color-text-muted)] mt-1">
            Select a surface to continue your workflow.
          </p>
        </div>

        <div className="p-4 space-y-2 overflow-y-auto scroll-premium">
          {areaViews.map((entry) => {
            const active = state.currentView === entry.id;
            return (
              <button
                key={entry.id}
                onClick={() => handleOpenView(entry.id)}
                className={`w-full text-left premium-panel p-4 transition-all ${
                  active ? 'border-[color:rgba(108,199,255,0.56)]' : 'hover:border-[color:var(--color-border-strong)]'
                }`}
              >
                <div className="text-sm font-semibold text-[color:var(--color-text)]">{entry.title}</div>
                <div className="text-xs text-[color:var(--color-text-muted)] mt-1">{entry.description}</div>
              </button>
            );
          })}

          <button
            onClick={() => setAppsLibraryOpen(true)}
            className="w-full premium-panel p-4 text-left hover:border-[color:rgba(108,199,255,0.56)]"
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-[color:var(--color-text)]">
              <Library size={14} className="text-[color:var(--color-accent)]" />
              Open Apps Library
            </div>
            <div className="text-xs text-[color:var(--color-text-muted)] mt-1">
              Browse all non-core modules from one searchable list.
            </div>
          </button>
        </div>
      </div>
    );
  };

  const renderCommandBar = () => (
    <div className="h-full flex items-center justify-between px-4 md:px-6 gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={() => setContextRailOpen((prev) => !prev)}
          className="premium-button h-10 w-10 inline-flex items-center justify-center"
          title={contextRailOpen ? 'Collapse context rail' : 'Expand context rail'}
          aria-label={contextRailOpen ? 'Collapse context rail' : 'Expand context rail'}
        >
          {contextRailOpen ? <PanelLeftClose size={16} /> : <PanelLeft size={16} />}
        </button>

        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-[color:var(--color-text-soft)]">
            <Sparkles size={12} className="text-[color:var(--color-accent)]" />
            Ashim UX 5.0
          </div>
          <h1 className="text-sm md:text-base font-semibold text-[color:var(--color-text)] truncate">
            {VIEW_REGISTRY.find((entry) => entry.id === state.currentView)?.title || 'Inbox'}
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => setCommandOpen(true)}
          className="premium-button px-3 h-10 inline-flex items-center gap-2 text-xs"
          title="Command Palette"
        >
          <Command size={14} />
          <span className="hidden md:inline">Command</span>
        </button>

        <button
          onClick={() => setAppsLibraryOpen(true)}
          className="premium-button px-3 h-10 inline-flex items-center gap-2 text-xs"
          title="Apps Library"
        >
          <Library size={14} />
          <span className="hidden md:inline">Apps</span>
        </button>

        <button
          onClick={() => handlers.handleNewChat()}
          className="premium-button px-3 h-10 inline-flex items-center gap-2 text-xs border-[color:rgba(108,199,255,0.46)] bg-[color:rgba(108,199,255,0.16)]"
          title="New Chat"
        >
          <Plus size={14} />
          <span className="hidden md:inline">New Chat</span>
        </button>
      </div>
    </div>
  );

  if (state.isAuthLoading) {
    return (
      <div className="h-screen flex items-center justify-center text-[color:var(--color-text-muted)]">
        Loading Ashim...
      </div>
    );
  }

  if (!state.session) {
    return <Auth />;
  }

  const showContextRail = isTablet ? mobileSurface === 'context' || contextRailOpen : contextRailOpen;

  return (
    <>
      <AppShell
        primaryNav={
          <IconSidebar
            currentArea={primaryArea}
            onAreaChange={handlePrimaryAreaChange}
            onOpenAppsLibrary={() => setAppsLibraryOpen(true)}
            onOpenCommandPalette={() => setCommandOpen(true)}
            onOpenSettings={() => handlers.setIsSettingsOpen(true)}
          />
        }
        commandBar={renderCommandBar()}
        contextRail={renderContextRail()}
        showContextRail={showContextRail}
        onCloseContextRail={() => {
          setContextRailOpen(false);
          setMobileSurface('content');
        }}
        content={
          <ViewContainer
            logic={logic}
            onBack={() => {
              setMobileSurface('context');
              setContextRailOpen(true);
            }}
            toggleChatList={() => setContextRailOpen((prev) => !prev)}
            isChatListOpen={contextRailOpen}
          />
        }
      />

      <CommandPalette isOpen={commandOpen} onClose={() => setCommandOpen(false)} items={commandItems} />

      <AppsLibraryDrawer
        isOpen={appsLibraryOpen}
        onClose={() => setAppsLibraryOpen(false)}
        entries={APPS_LIBRARY_VIEWS}
        onOpenView={handleOpenView}
      />

      <SettingsModal
        isOpen={state.isSettingsOpen}
        onClose={() => handlers.setIsSettingsOpen(false)}
        config={state.config}
        onSave={handlers.saveConfig}
        isDarkMode={true}
        userId={state.session.user.id}
        isProcessingPersona={state.isProcessingPersona}
        onLogout={() => {
          handlers.setIsSettingsOpen(false);
          supabase.auth.signOut();
        }}
      />

      <DeleteModal
        isOpen={state.deleteModalState.isOpen}
        onClose={() => handlers.setDeleteModalState({ isOpen: false, chatId: null })}
        onConfirm={async () => {
          if (state.deleteModalState.chatId) {
            await supabase.from('chats').delete().eq('id', state.deleteModalState.chatId);
            handlers.fetchSessions();
            if (state.currentSessionId === state.deleteModalState.chatId) {
              if (isMobile) {
                setMobileSurface('context');
              }
              handlers.handleNewChat();
            }
          }
        }}
        chatTitle="this chat"
        isDarkMode={true}
      />

      <NewChatModal
        isOpen={state.isNewChatModalOpen}
        onClose={() => handlers.setIsNewChatModalOpen(false)}
        personas={state.personas}
        onSelectPersona={async (personaId, withMemory) => {
          await handlers.handleSelectPersona(personaId, withMemory);
          if (isTablet) {
            setMobileSurface('content');
            setContextRailOpen(false);
          }
        }}
        userId={state.session.user.id}
      />

      <SessionModal
        isOpen={state.isSessionModalOpen}
        onClose={() => handlers.setIsSessionModalOpen(false)}
        userId={state.session.user.id}
        isDarkMode={true}
        onSessionCreated={(session) => {
          handlers.setCurrentAshimSession(session);
          handlers.fetchSessions();
        }}
      />

      <SqlSetupInstructions
        isOpen={state.showSqlSetup}
        onClose={() => handlers.setShowSqlSetup(false)}
        isDarkMode={true}
      />

      <ToastNotification
        notifications={notifications}
        onDismiss={dismissNotification}
        onNavigate={handleNotificationNavigate}
      />
    </>
  );
};

export default App;
