import { useCallback, useState } from 'react';
import type { OnboardingMode } from '../components/onboarding/OnboardingModeModal';

const ONBOARDING_STORAGE_KEY = 'ashim.onboarding.v1';

export interface StoredOnboardingState {
  mode: OnboardingMode;
  completedAtIso: string;
}

const readOnboardingState = (): StoredOnboardingState | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredOnboardingState;
    if (!parsed?.mode || !parsed?.completedAtIso) return null;
    if (!['companion', 'decision_room', 'builder'].includes(parsed.mode)) return null;
    return parsed;
  } catch {
    return null;
  }
};

const writeOnboardingState = (state: StoredOnboardingState | null): void => {
  if (typeof window === 'undefined') return;
  if (!state) {
    window.localStorage.removeItem(ONBOARDING_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(state));
};

export const useOnboardingState = () => {
  const [onboardingState, setOnboardingState] = useState<StoredOnboardingState | null>(() =>
    readOnboardingState()
  );

  const completeOnboarding = useCallback((mode: OnboardingMode) => {
    const nextState: StoredOnboardingState = {
      mode,
      completedAtIso: new Date().toISOString(),
    };
    writeOnboardingState(nextState);
    setOnboardingState(nextState);
  }, []);

  const resetOnboarding = useCallback(() => {
    writeOnboardingState(null);
    setOnboardingState(null);
  }, []);

  return {
    onboardingState,
    completeOnboarding,
    resetOnboarding,
  };
};
