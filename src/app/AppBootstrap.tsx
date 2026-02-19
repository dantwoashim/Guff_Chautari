import React, { useEffect, useState } from 'react';
import Auth from '../../components/Auth';
import { Loader2, Sparkles } from '../../components/Icons';
import { useChatLogic } from '../../hooks/useChatLogic';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { useSetMobileViewAction } from '../hooks/store/useAppActions';
import { useBYOK } from '../hooks/useBYOK';
import { useOnboardingState } from '../hooks/useOnboardingState';
import { extractMarketplaceShareTokenFromLocation } from '../marketplace';
import E2ESmokeHarness from './E2ESmokeHarness';
import MainLayout from './MainLayout';
import { RuntimeProviders } from './providers/RuntimeProviders';

const RuntimeAppBootstrap: React.FC = () => {
  const logic = useChatLogic();
  const { state, handlers } = logic;
  const isMobile = useIsMobile();
  const byok = useBYOK('gemini');
  const setMobileView = useSetMobileViewAction();

  const { onboardingState, completeOnboarding, resetOnboarding } = useOnboardingState();
  const [shareLinkChecked, setShareLinkChecked] = useState(false);
  const [isByokModalOpen, setIsByokModalOpen] = useState(false);

  const workspaceRuntimeId = state.session?.user?.id
    ? `workspace-${state.session.user.id}`
    : 'workspace-anon';

  useEffect(() => {
    const shouldOpenFirstPersonaPicker =
      Boolean(state.session) &&
      byok.status === 'healthy' &&
      onboardingState?.mode === 'companion' &&
      !state.currentSessionId &&
      state.conversations.length === 0 &&
      !state.isNewChatModalOpen;

    if (shouldOpenFirstPersonaPicker) {
      handlers.setIsNewChatModalOpen(true);
    }
  }, [
    byok.status,
    handlers,
    onboardingState?.mode,
    state.conversations.length,
    state.currentSessionId,
    state.isNewChatModalOpen,
    state.session,
  ]);

  useEffect(() => {
    if (shareLinkChecked) return;
    if (!state.session) return;
    if (typeof window === 'undefined') return;

    const token = extractMarketplaceShareTokenFromLocation(window.location.href);
    if (token) {
      handlers.setCurrentView('shared_pack_preview');
      if (isMobile) {
        setMobileView('content');
      }
    }

    setShareLinkChecked(true);
  }, [handlers, isMobile, setMobileView, shareLinkChecked, state.session]);

  const shouldShowOnboardingModal = Boolean(state.session) && byok.status === 'healthy' && !onboardingState;

  const handleOnboardingSelect = (mode: 'companion' | 'decision_room' | 'builder') => {
    completeOnboarding(mode);

    if (mode === 'decision_room') {
      handlers.setCurrentView('decision_room');
      if (isMobile) setMobileView('content');
      return;
    }

    if (mode === 'builder') {
      handlers.setCurrentView('persona_import');
      if (isMobile) setMobileView('content');
      return;
    }

    handlers.setCurrentView('chat');
    if (!state.currentSessionId && state.conversations.length === 0) {
      handlers.setIsNewChatModalOpen(true);
    }
  };

  if (state.isAuthLoading || (state.session && byok.isLoading)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="liquid-background">
          <div className="orb orb-1" />
          <div className="orb orb-2" />
          <div className="orb orb-3" />
          <div className="orb orb-4" />
        </div>
        <div className="noise-overlay" />
        <div className="relative z-10 flex flex-col items-center gap-6">
          <div className="glass-thick glow-indigo animate-breathe flex h-20 w-20 items-center justify-center rounded-3xl">
            <Sparkles className="text-liquid-indigo" size={32} />
          </div>
          <div className="flex items-center gap-3">
            <Loader2 className="animate-spin text-white/40" size={20} />
            <span className="text-sm font-medium text-white/50">Loading...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!state.session) {
    return <Auth />;
  }

  return (
    <RuntimeProviders
      byokStatus={byok.status}
      byokFingerprint={byok.fingerprint ?? null}
      workspaceRuntimeId={workspaceRuntimeId}
    >
      <MainLayout
        logic={logic}
        byok={byok}
        isMobile={isMobile}
        onboardingState={onboardingState}
        shouldShowOnboardingModal={shouldShowOnboardingModal}
        isByokModalOpen={isByokModalOpen}
        onSetByokModalOpen={setIsByokModalOpen}
        onOnboardingSelect={handleOnboardingSelect}
        onSwitchMode={resetOnboarding}
      />
    </RuntimeProviders>
  );
};

const shouldRenderE2ESmokeHarness = (): boolean => {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('e2e') === '1';
};

const AppBootstrap: React.FC = () => {
  if (shouldRenderE2ESmokeHarness()) {
    return <E2ESmokeHarness />;
  }

  return <RuntimeAppBootstrap />;
};

export default AppBootstrap;
