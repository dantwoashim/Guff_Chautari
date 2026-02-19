import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AppBootstrap from '../AppBootstrap';

const { useChatLogicMock, useBYOKMock, useOnboardingStateMock } = vi.hoisted(() => ({
  useChatLogicMock: vi.fn(),
  useBYOKMock: vi.fn(),
  useOnboardingStateMock: vi.fn(),
}));

vi.mock('../../../components/Auth', () => ({
  default: () => <div data-testid="auth-view">Auth</div>,
}));

vi.mock('../../../hooks/useChatLogic', () => ({
  useChatLogic: useChatLogicMock,
}));

vi.mock('../../../hooks/useMediaQuery', () => ({
  useIsMobile: () => false,
}));

vi.mock('../../hooks/store/useAppActions', () => ({
  useSetMobileViewAction: () => vi.fn(),
}));

vi.mock('../../hooks/useBYOK', () => ({
  useBYOK: useBYOKMock,
}));

vi.mock('../../hooks/useOnboardingState', () => ({
  useOnboardingState: useOnboardingStateMock,
}));

vi.mock('../../marketplace', () => ({
  extractMarketplaceShareTokenFromLocation: () => null,
}));

vi.mock('../MainLayout', () => ({
  default: () => <div data-testid="main-layout">Main Layout</div>,
}));

vi.mock('../providers/RuntimeProviders', () => ({
  RuntimeProviders: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const buildLogic = (session: { user: { id: string } } | null) => ({
  state: {
    isAuthLoading: false,
    session,
    currentSessionId: '',
    conversations: [],
    isNewChatModalOpen: false,
  },
  handlers: {
    setIsNewChatModalOpen: vi.fn(),
    setCurrentView: vi.fn(),
  },
});

const buildByok = () => ({
  status: 'healthy',
  isLoading: false,
  fingerprint: null,
});

describe('AppBootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useOnboardingStateMock.mockReturnValue({
      onboardingState: null,
      completeOnboarding: vi.fn(),
      resetOnboarding: vi.fn(),
    });

    useBYOKMock.mockReturnValue(buildByok());
  });

  it('renders auth screen when session is not available', () => {
    useChatLogicMock.mockReturnValue(buildLogic(null));

    render(<AppBootstrap />);
    expect(screen.getByTestId('auth-view')).toBeInTheDocument();
  });

  it('renders main layout when user is authenticated', () => {
    useChatLogicMock.mockReturnValue(buildLogic({ user: { id: 'user-1' } }));

    render(<AppBootstrap />);
    expect(screen.getByTestId('main-layout')).toBeInTheDocument();
  });
});
