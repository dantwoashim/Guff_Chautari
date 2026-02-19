import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useBackgroundResponses } from '../../hooks/notifications/useBackgroundResponses';
import {
  AlertTriangle,
  CircleDashed,
  Download,
  Loader2,
  Star,
  Users,
  WifiOff,
} from '../../components/Icons';
import AppShell from '../../components/layout/AppShell';
import ConversationList from '../../components/layout/ConversationList';
import IconSidebar from '../../components/layout/IconSidebar';
import ToastNotification from '../../components/notifications/ToastNotification';
import { useRuntimeProviders } from './providers/RuntimeProviders';
import type { useChatLogic } from '../../hooks/useChatLogic';
import type { useBYOK } from '../hooks/useBYOK';
import BYOKHealthBanner from '../components/byok/BYOKHealthBanner';
import BYOKHealthDashboard from '../components/byok/BYOKHealthDashboard';
import BYOKSetupModal from '../components/byok/BYOKSetupModal';
import OnboardingModeModal, { type OnboardingMode } from '../components/onboarding/OnboardingModeModal';
import type { StoredOnboardingState } from '../hooks/useOnboardingState';
import {
  useCurrentViewSelector,
  useDeleteModalStateSelector,
  useIsAdminOpenSelector,
  useIsChatListOpenSelector,
  useIsNewChatModalOpenSelector,
  useIsSessionModalOpenSelector,
  useIsSettingsOpenSelector,
  useMobileViewSelector,
  useNavViewSelector,
  useSearchTermSelector,
} from '../hooks/store/useAppSelectors';
import {
  useSetCurrentViewAction,
  useSetDeleteModalStateAction,
  useSetIsAdminOpenAction,
  useSetIsChatListOpenAction,
  useSetIsNewChatModalOpenAction,
  useSetIsSessionModalOpenAction,
  useSetIsSettingsOpenAction,
  useSetMobileViewAction,
  useSetNavViewAction,
  useSetSearchTermAction,
} from '../hooks/store/useAppActions';
import { messageRepository } from '../data/repositories';
import { useInstallPrompt } from '../pwa/useInstallPrompt';
import { useOfflineQueueStatus } from '../offline/useOfflineQueueStatus';
import { i18nRuntime, resolveCountSuffix } from '../i18n';
import { checkIsAdmin } from '../../services/adminService';
import '../../styles/whatsapp-theme.css';

const AdminDashboard = lazy(() => import('../../components/admin/AdminDashboard'));
const SettingsModal = lazy(() => import('../../components/settings/SettingsModal'));
const SessionModal = lazy(() => import('../../components/SessionModal'));
const DeleteModal = lazy(() => import('../../components/DeleteModal'));
const NewChatModal = lazy(() => import('../../components/modals/NewChatModal'));
const ViewContainer = lazy(() => import('../../components/ViewContainer'));

const PlaceholderView: React.FC<{
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  message: string;
}> = ({ icon: Icon, title, message }) => (
  <div className="flex h-full flex-col items-center justify-center border-r border-[#313d45] bg-[#111b21] p-8 text-center">
    <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[#202c33]">
      <Icon size={40} className="text-[#8696a0]" />
    </div>
    <h2 className="mb-2 text-xl font-light text-[#e9edef]">{title}</h2>
    <p className="max-w-xs text-sm text-[#8696a0]">{message}</p>
  </div>
);

interface MainLayoutProps {
  logic: ReturnType<typeof useChatLogic>;
  byok: ReturnType<typeof useBYOK>;
  isMobile: boolean;
  onboardingState: StoredOnboardingState | null;
  shouldShowOnboardingModal: boolean;
  isByokModalOpen: boolean;
  onSetByokModalOpen: (isOpen: boolean) => void;
  onOnboardingSelect: (mode: OnboardingMode) => void;
  onSwitchMode: () => void;
}

const MainLayout: React.FC<MainLayoutProps> = ({
  logic,
  byok,
  isMobile,
  onboardingState,
  shouldShowOnboardingModal,
  isByokModalOpen,
  onSetByokModalOpen,
  onOnboardingSelect,
  onSwitchMode,
}) => {
  const { state, handlers } = logic;
  const { activeLocale } = useRuntimeProviders();
  const { isOnline, queuedCount } = useOfflineQueueStatus();
  const { canInstall, promptInstall, dismissPrompt } = useInstallPrompt();

  const navView = useNavViewSelector();
  const setNavView = useSetNavViewAction();
  const searchTerm = useSearchTermSelector();
  const setSearchTerm = useSetSearchTermAction();
  const mobileView = useMobileViewSelector();
  const setMobileView = useSetMobileViewAction();
  const isChatListOpen = useIsChatListOpenSelector();
  const setIsChatListOpen = useSetIsChatListOpenAction();
  const isAdminOpen = useIsAdminOpenSelector();
  const setIsAdminOpen = useSetIsAdminOpenAction();
  const currentView = useCurrentViewSelector();

  const isSettingsOpen = useIsSettingsOpenSelector();
  const setIsSettingsOpen = useSetIsSettingsOpenAction();
  const deleteModalState = useDeleteModalStateSelector();
  const setDeleteModalState = useSetDeleteModalStateAction();
  const isNewChatModalOpen = useIsNewChatModalOpenSelector();
  const setIsNewChatModalOpen = useSetIsNewChatModalOpenAction();
  const isSessionModalOpen = useIsSessionModalOpenSelector();
  const setIsSessionModalOpen = useSetIsSessionModalOpenAction();
  const setCurrentView = useSetCurrentViewAction();

  const [isRotatingKey, setIsRotatingKey] = useState(false);
  const [canAccessAdmin, setCanAccessAdmin] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const userId = state.session?.user?.id;
    if (!userId) {
      setCanAccessAdmin(false);
      setIsAdminOpen(false);
      return () => {
        isMounted = false;
      };
    }

    void checkIsAdmin(userId).then((isAdmin) => {
      if (!isMounted) return;
      setCanAccessAdmin(isAdmin);
      if (!isAdmin) {
        setIsAdminOpen(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [setIsAdminOpen, state.session?.user?.id]);

  const { notifications, dismissNotification, markSessionRead } = useBackgroundResponses(
    state.currentSessionId
  );

  const handleNotificationNavigate = async (sessionId: string) => {
    handlers.updateCurrentSession(sessionId);
    markSessionRead(sessionId);
    setTimeout(async () => {
      await handlers.refreshMessages?.(sessionId);
    }, 100);

    if (isMobile) {
      setMobileView('content');
    }
  };

  const handleViewChange = (view: string) => {
    if (view === 'admin') {
      if (!canAccessAdmin) return;
      setIsAdminOpen(true);
    } else {
      setNavView(view);
      if (currentView !== 'chat') {
        setCurrentView('chat');
      }
    }
  };

  const handleFeatureViewChange = (
    view:
      | 'persona_import'
      | 'decision_room'
      | 'counterfactual_panel'
      | 'reflection_dashboard'
      | 'knowledge_workbench'
      | 'council_room'
      | 'boardroom'
      | 'workflow_workbench'
      | 'agent_dashboard'
      | 'activity_timeline'
      | 'autonomy_monitor'
      | 'emotional_dashboard'
      | 'plugin_studio'
      | 'template_gallery'
      | 'pack_gallery'
      | 'benchmark_dashboard'
      | 'creator_hub'
      | 'creator_analytics'
      | 'creator_earnings'
      | 'billing_dashboard'
      | 'team_playbooks'
      | 'team_dashboard'
      | 'workspace_settings'
      | 'cross_workspace_search'
      | 'org_admin_dashboard'
      | 'billing_admin'
      | 'key_vault_panel'
      | 'org_analytics_panel'
      | 'voice_chat'
      | 'ambient_mode'
      | 'api_memory_consent'
      | 'vertical_picker'
      | 'founder_dashboard'
      | 'research_dashboard'
      | 'career_dashboard'
      | 'health_dashboard'
      | 'locale_picker'
      | 'offline_queue'
      | 'platform_ops'
      | 'protocol_compiler'
  ) => {
    setCurrentView(view);
    if (isMobile) {
      setMobileView('content');
    }
  };

  const handleSessionSelect = (id: string) => {
    handlers.updateCurrentSession(id);
    if (isMobile) {
      setMobileView('content');
    }
  };

  const handleSelectPersonaWrapper = async (personaId: string, withMemory: boolean) => {
    await handlers.handleSelectPersona(personaId, withMemory);
    if (isMobile) {
      setMobileView('content');
    }
  };

  const handleBYOKSave = async (_provider: 'gemini', apiKey: string) => {
    setIsRotatingKey(true);
    try {
      const result = await byok.saveKey(apiKey);
      if (result.ok) {
        onSetByokModalOpen(false);
      }
      return result;
    } finally {
      setIsRotatingKey(false);
    }
  };

  const handleBYOKRevoke = () => {
    const shouldRevoke = window.confirm('Revoke your Gemini key from this device?');
    if (!shouldRevoke) return;
    byok.revokeKey();
    onSetByokModalOpen(false);
  };

  const displayedSessions = useMemo(() => {
    if (navView === 'archived') {
      return state.conversations.filter((conversation) => conversation.is_archived);
    }
    return state.conversations.filter((conversation) => !conversation.is_archived);
  }, [state.conversations, navView]);

  const modeLabel =
    onboardingState?.mode === 'decision_room'
      ? 'Decision Room'
      : onboardingState?.mode === 'builder'
        ? 'Builder'
        : 'Companion';

  const renderListPanel = () => {
    switch (navView) {
      case 'status':
        return (
          <PlaceholderView
            icon={CircleDashed}
            title="Status"
            message="Share updates with your contacts. Coming soon."
          />
        );
      case 'communities':
        return (
          <PlaceholderView
            icon={Users}
            title="Communities"
            message="Bring your groups together. Coming soon."
          />
        );
      case 'starred':
        return (
          <PlaceholderView
            icon={Star}
            title="Starred Messages"
            message="Quickly access your important messages. Coming soon."
          />
        );
      case 'archived':
      case 'chat':
      default:
        return (
          <ConversationList
            sessions={displayedSessions}
            personas={state.personas}
            currentSessionId={state.currentSessionId}
            onSelectSession={handleSessionSelect}
            onSelectPersona={(personaId) => handleSelectPersonaWrapper(personaId, false)}
            onNewChat={handlers.handleNewChat}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            isLoading={state.sessionManager.isLoading}
            onRetry={() => handlers.fetchSessions()}
            title={navView === 'archived' ? 'Archived' : 'Chats'}
            onViewArchived={() => setNavView('archived')}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onNavigate={setNavView}
            onOpenPanel={handleFeatureViewChange}
          />
        );
    }
  };

  return (
    <>
      <BYOKHealthBanner
        status={byok.status}
        fingerprint={byok.fingerprint}
        lastCheck={byok.lastCheck}
        errorMessage={byok.errorMessage}
        onRevalidate={byok.revalidate}
        onRevoke={handleBYOKRevoke}
      />

      {canInstall ? (
        <div className="mx-4 mt-3 flex items-center justify-between gap-3 rounded-xl border border-[#1d4a5f] bg-[#0f2430] px-4 py-3 text-sm text-[#b9deef]">
          <div className="flex items-center gap-2">
            <Download size={15} className="text-[#7ed0f3]" />
            <span>{i18nRuntime.t('app.install.prompt', { locale: activeLocale })}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded border border-[#2e6c87] px-3 py-1.5 text-xs text-[#c8ebfb] hover:bg-[#174057]"
              onClick={() => {
                void promptInstall();
              }}
            >
              {i18nRuntime.t('app.install.action', { locale: activeLocale })}
            </button>
            <button
              type="button"
              className="rounded border border-transparent px-2 py-1.5 text-xs text-[#9ec4d6] hover:text-[#d7f2ff]"
              onClick={dismissPrompt}
            >
              {i18nRuntime.t('app.dismiss', { locale: activeLocale })}
            </button>
          </div>
        </div>
      ) : null}

      {!isOnline || queuedCount > 0 ? (
        <div
          className={`mx-4 mt-3 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${
            !isOnline
              ? 'border-[#6b2f31] bg-[#2a1517] text-[#f5c3c7]'
              : 'border-[#5b5325] bg-[#27230f] text-[#eadf9f]'
          }`}
        >
          <WifiOff size={15} />
          {!isOnline ? (
            <span>
              {i18nRuntime.t('app.offline.offline_queue', {
                locale: activeLocale,
                values: {
                  count: queuedCount,
                  countSuffix: resolveCountSuffix(queuedCount, activeLocale),
                },
              })}
            </span>
          ) : (
            <span>
              {i18nRuntime.t('app.offline.reconnected_queue', {
                locale: activeLocale,
                values: {
                  count: queuedCount,
                  countSuffix: resolveCountSuffix(queuedCount, activeLocale),
                },
              })}
            </span>
          )}
        </div>
      ) : null}

      {!isOnline || byok.status !== 'healthy' ? (
        <div className="mx-4 mt-3 flex items-center gap-2 rounded-xl border border-[#605723] bg-[#26220e] px-4 py-3 text-sm text-[#f0e3aa]">
          <AlertTriangle size={15} />
          <span>
            {i18nRuntime.t('app.degraded.banner', { locale: activeLocale })}
            {!isOnline
              ? i18nRuntime.t('app.degraded.offline_suffix', { locale: activeLocale })
              : i18nRuntime.t('app.degraded.byok_suffix', { locale: activeLocale })}
          </span>
        </div>
      ) : null}

      <BYOKHealthDashboard
        status={byok.status}
        fingerprint={byok.fingerprint}
        lastCheck={byok.lastCheck}
        onRotate={() => onSetByokModalOpen(true)}
      />

      {onboardingState ? (
        <div className="mx-4 mt-3 flex items-center justify-between rounded-xl border border-[#2a4f61] bg-[#102731] px-4 py-3 text-sm text-[#b9deef]">
          <span>
            {i18nRuntime.t('app.mode.label', {
              locale: activeLocale,
              values: { mode: modeLabel },
            })}
          </span>
          <button
            type="button"
            className="rounded border border-[#2e6c87] px-3 py-1.5 text-xs text-[#c8ebfb] hover:bg-[#174057]"
            onClick={onSwitchMode}
          >
            {i18nRuntime.t('app.mode.switch', { locale: activeLocale })}
          </button>
        </div>
      ) : null}

      <AppShell
        mobileView={mobileView}
        isListVisible={isChatListOpen}
        sidebar={
          <IconSidebar
            currentView={navView}
            onViewChange={handleViewChange}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onProfileClick={() => setIsSettingsOpen(true)}
            canAccessAdmin={canAccessAdmin}
            activeFeatureView={currentView !== 'chat' ? currentView : null}
            onOpenFeatureView={handleFeatureViewChange}
          />
        }
        list={renderListPanel()}
      >
        <div className="relative flex h-full flex-col">
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center text-[#8696a0]">
                <Loader2 className="animate-spin" size={24} />
              </div>
            }
          >
            <ViewContainer
              logic={logic}
              onBack={() => setMobileView('list')}
              toggleChatList={() => setIsChatListOpen(!isChatListOpen)}
              isChatListOpen={isChatListOpen}
            />
          </Suspense>
        </div>
      </AppShell>

      <Suspense fallback={null}>
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          config={state.config}
          onSave={handlers.saveConfig}
          isDarkMode={true}
          userId={state.session.user.id}
          isProcessingPersona={state.isProcessingPersona}
          onLogout={() => {
            setIsSettingsOpen(false);
            supabase.auth.signOut();
          }}
        />

        <DeleteModal
          isOpen={deleteModalState.isOpen}
          onClose={() => setDeleteModalState({ isOpen: false, chatId: null })}
          onConfirm={async () => {
            if (deleteModalState.chatId) {
              await messageRepository.deleteChat(deleteModalState.chatId);
              handlers.fetchSessions();
              if (state.currentSessionId === deleteModalState.chatId) {
                if (isMobile) setMobileView('list');
                handlers.handleNewChat();
              }
            }
          }}
          chatTitle="this chat"
          isDarkMode={true}
        />

        <NewChatModal
          isOpen={isNewChatModalOpen}
          onClose={() => setIsNewChatModalOpen(false)}
          personas={state.personas}
          onSelectPersona={handleSelectPersonaWrapper}
          userId={state.session.user.id}
        />

        <SessionModal
          isOpen={isSessionModalOpen}
          onClose={() => setIsSessionModalOpen(false)}
          userId={state.session.user.id}
          isDarkMode={true}
          onSessionCreated={(session) => {
            handlers.setCurrentAshimSession(session);
            handlers.fetchSessions();
          }}
        />
      </Suspense>

      {isAdminOpen && canAccessAdmin ? (
        <Suspense fallback={null}>
          <AdminDashboard userId={state.session.user.id} onClose={() => setIsAdminOpen(false)} />
        </Suspense>
      ) : null}

      <ToastNotification
        notifications={notifications.filter((notification) => notification.sessionId !== state.currentSessionId)}
        onDismiss={dismissNotification}
        onNavigate={handleNotificationNavigate}
      />

      <BYOKSetupModal
        isOpen={byok.requiresSetup || isByokModalOpen}
        isSaving={byok.isSaving || isRotatingKey}
        title={byok.requiresSetup ? 'Set Up BYOK' : 'Rotate Gemini Key'}
        canClose={!byok.requiresSetup}
        onClose={() => onSetByokModalOpen(false)}
        onSubmit={handleBYOKSave}
      />

      <OnboardingModeModal isOpen={shouldShowOnboardingModal} onSelect={onOnboardingSelect} />
    </>
  );
};

export default MainLayout;
