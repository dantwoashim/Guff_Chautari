import { trackTelemetryEvent } from '../observability/telemetry';

export const registerServiceWorker = async (): Promise<ServiceWorkerRegistration | null> => {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    trackTelemetryEvent('pwa.sw.registered', {
      scope: registration.scope,
      active: Boolean(registration.active),
    });

    return registration;
  } catch (error) {
    trackTelemetryEvent('pwa.sw.registration_failed', {
      message: error instanceof Error ? error.message : 'unknown registration error',
    });
    return null;
  }
};

