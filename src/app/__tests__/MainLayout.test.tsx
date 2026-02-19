import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MainLayout from '../MainLayout';
import { useAppStore } from '../../store';

vi.mock('../providers/RuntimeProviders', () => ({
  useRuntimeProviders: () => ({ activeLocale: 'en' }),
}));

vi.mock('../../../hooks/notifications/useBackgroundResponses', () => ({
  useBackgroundResponses: () => ({
    notifications: [],
    dismissNotification: vi.fn(),
    markSessionRead: vi.fn(),
  }),
}));

vi.mock('../../../components/layout/AppShell', () => ({
  default: ({ sidebar, list, children }: { sidebar: React.ReactNode; list: React.ReactNode; children: React.ReactNode }) => (
    <div>
      <div data-testid="sidebar">{sidebar}</div>
      <div data-testid="list">{list}</div>
      <div data-testid="content">{children}</div>
    </div>
  ),
}));

vi.mock('../../../components/layout/IconSidebar', () => ({
  default: () => <div data-testid="icon-sidebar" />, 
}));

vi.mock('../../../components/layout/ConversationList', () => ({
  default: () => <div data-testid="conversation-list" />,
}));

vi.mock('../../../components/notifications/ToastNotification', () => ({
  default: () => <div data-testid="toast" />,
}));

vi.mock('../../components/byok/BYOKHealthBanner', () => ({
  default: () => <div data-testid="byok-banner" />,
}));

vi.mock('../../components/byok/BYOKHealthDashboard', () => ({
  default: () => <div data-testid="byok-dashboard" />,
}));

vi.mock('../../components/byok/BYOKSetupModal', () => ({
  default: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="byok-modal" /> : null,
}));

vi.mock('../../components/onboarding/OnboardingModeModal', () => ({
  default: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="onboarding-modal" /> : null,
}));

vi.mock('../../offline/useOfflineQueueStatus', () => ({
  useOfflineQueueStatus: () => ({ isOnline: true, queuedCount: 0 }),
}));

vi.mock('../../pwa/useInstallPrompt', () => ({
  useInstallPrompt: () => ({
    canInstall: false,
    promptInstall: vi.fn(),
    dismissPrompt: vi.fn(),
  }),
}));

vi.mock('../../i18n', () => ({
  i18nRuntime: {
    t: (key: string) => key,
  },
  resolveCountSuffix: () => '',
}));

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    auth: {
      signOut: vi.fn(),
    },
  },
}));

vi.mock('../../data/repositories', () => ({
  messageRepository: {
    deleteChat: vi.fn(),
  },
}));

vi.mock('../../../components/admin/AdminDashboard', () => ({
  default: () => <div data-testid="admin-dashboard" />,
}));
vi.mock('../../../components/settings/SettingsModal', () => ({
  default: () => null,
}));
vi.mock('../../../components/SessionModal', () => ({
  default: () => null,
}));
vi.mock('../../../components/DeleteModal', () => ({
  default: () => null,
}));
vi.mock('../../../components/modals/NewChatModal', () => ({
  default: () => null,
}));
vi.mock('../../../components/ViewContainer', () => ({
  default: () => <div data-testid="view-container" />,
}));

vi.mock('../../../services/adminService', () => ({
  checkIsAdmin: vi.fn().mockResolvedValue(false),
}));

const baseLogic = {
  state: {
    session: { user: { id: 'user-1' } },
    conversations: [],
    currentSessionId: '',
    personas: [],
    sessionManager: { isLoading: false },
    config: { systemInstruction: '', model: 'gemini-3-pro-preview' },
    isProcessingPersona: false,
  },
  handlers: {
    updateCurrentSession: vi.fn(),
    refreshMessages: vi.fn(),
    handleSelectPersona: vi.fn(),
    handleNewChat: vi.fn(),
    fetchSessions: vi.fn(),
    saveConfig: vi.fn(),
    setCurrentAshimSession: vi.fn(),
  },
};

const baseByok = {
  status: 'healthy',
  fingerprint: null,
  lastCheck: Date.now(),
  errorMessage: undefined,
  revalidate: vi.fn(),
  revokeKey: vi.fn(),
  saveKey: vi.fn(async () => ({ ok: true })),
  isSaving: false,
  requiresSetup: false,
};

describe('MainLayout', () => {
  beforeEach(() => {
    useAppStore.setState({
      currentView: 'chat',
      navView: 'chat',
      searchTerm: '',
      mobileView: 'list',
      isChatListOpen: true,
      isAdminOpen: false,
      isSettingsOpen: false,
      isNewChatModalOpen: false,
      isSessionModalOpen: false,
      deleteModalState: { isOpen: false, chatId: null },
    });
  });

  it('renders core chat shell panels', async () => {
    render(
      <MainLayout
        logic={baseLogic as never}
        byok={baseByok as never}
        isMobile={false}
        onboardingState={null}
        shouldShowOnboardingModal={false}
        isByokModalOpen={false}
        onSetByokModalOpen={vi.fn()}
        onOnboardingSelect={vi.fn()}
        onSwitchMode={vi.fn()}
      />
    );

    expect(screen.getByTestId('icon-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('conversation-list')).toBeInTheDocument();
    expect(await screen.findByTestId('view-container')).toBeInTheDocument();
  });

  it('shows onboarding modal when bootstrap requests it', () => {
    render(
      <MainLayout
        logic={baseLogic as never}
        byok={baseByok as never}
        isMobile={false}
        onboardingState={null}
        shouldShowOnboardingModal={true}
        isByokModalOpen={false}
        onSetByokModalOpen={vi.fn()}
        onOnboardingSelect={vi.fn()}
        onSwitchMode={vi.fn()}
      />
    );

    expect(screen.getByTestId('onboarding-modal')).toBeInTheDocument();
  });
});
