import { useCallback, useEffect, useState } from 'react';
import { trackTelemetryEvent } from '../observability/telemetry';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const DISMISS_STORAGE_KEY = 'ashim.pwa.install-prompt.dismissed.v1';

const readDismissed = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(DISMISS_STORAGE_KEY) === '1';
};

const writeDismissed = (value: boolean): void => {
  if (typeof window === 'undefined') return;
  if (value) {
    window.localStorage.setItem(DISMISS_STORAGE_KEY, '1');
  } else {
    window.localStorage.removeItem(DISMISS_STORAGE_KEY);
  }
};

const detectStandalone = (): boolean => {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
};

export const useInstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState<boolean>(readDismissed());
  const [isInstalled, setIsInstalled] = useState<boolean>(detectStandalone());

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      trackTelemetryEvent('pwa.install.prompt_available');
    };

    const onAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      writeDismissed(false);
      trackTelemetryEvent('pwa.install.completed');
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const dismissPrompt = useCallback(() => {
    setDismissed(true);
    writeDismissed(true);
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return false;

    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    const accepted = choice.outcome === 'accepted';

    trackTelemetryEvent(accepted ? 'pwa.install.accepted' : 'pwa.install.dismissed', {
      platform: choice.platform || 'unknown',
    });

    setDeferredPrompt(null);
    if (!accepted) {
      setDismissed(true);
      writeDismissed(true);
    }

    return accepted;
  }, [deferredPrompt]);

  return {
    canInstall: Boolean(deferredPrompt) && !dismissed && !isInstalled,
    isInstalled,
    promptInstall,
    dismissPrompt,
  };
};

