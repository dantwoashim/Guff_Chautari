import { useCallback, useEffect, useMemo, useState } from 'react';
import { BYOKKeyManager } from '../byok/keyManager';
import { checkProviderKeyHealth, validateProviderKey } from '../byok/keyHealth';
import { BYOK_PROVIDER_LABELS, type BYOKProvider, type KeyHealthStatus } from '../byok/types';

interface BYOKState {
  status: KeyHealthStatus;
  isLoading: boolean;
  isSaving: boolean;
  provider: BYOKProvider;
  fingerprint: string | null;
  lastCheck: number | null;
  errorMessage: string | null;
  diagnosticSteps: string[];
}

interface SaveResult {
  ok: boolean;
  errorMessage?: string;
}

const initialState: BYOKState = {
  status: 'unknown',
  isLoading: true,
  isSaving: false,
  provider: 'gemini',
  fingerprint: null,
  lastCheck: null,
  errorMessage: null,
  diagnosticSteps: [],
};

export const useBYOK = (provider: BYOKProvider = 'gemini') => {
  const [state, setState] = useState<BYOKState>({
    ...initialState,
    provider,
  });

  const hydrate = useCallback(async () => {
    const stored = BYOKKeyManager.getStoredKey(provider);
    if (!stored) {
      setState((prev) => ({
        ...prev,
        status: 'missing',
        isLoading: false,
        fingerprint: null,
        lastCheck: null,
        errorMessage: null,
        diagnosticSteps: [],
      }));
      return;
    }

    const decrypted = await BYOKKeyManager.getDecryptedKey(provider);
    if (!decrypted) {
      setState((prev) => ({
        ...prev,
        status: 'invalid',
        isLoading: false,
        fingerprint: stored.fingerprint,
        lastCheck: Date.now(),
        errorMessage: 'Stored key could not be decrypted. Please re-enter your key.',
        diagnosticSteps: [`Revoke the key and paste a fresh ${BYOK_PROVIDER_LABELS[provider]} key.`],
      }));
      return;
    }

    const health = await checkProviderKeyHealth(provider, decrypted);
    setState((prev) => ({
      ...prev,
      status: health.status,
      isLoading: false,
      fingerprint: stored.fingerprint,
      lastCheck: health.lastCheck,
      errorMessage: health.errorMessage ?? null,
      diagnosticSteps: health.diagnosticSteps ?? [],
    }));
  }, [provider]);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const saveKey = useCallback(
    async (rawApiKey: string): Promise<SaveResult> => {
      setState((prev) => ({ ...prev, isSaving: true, errorMessage: null }));
      const validation = await validateProviderKey(provider, rawApiKey);

      if (!validation.ok || validation.status === 'invalid') {
        setState((prev) => ({
          ...prev,
          isSaving: false,
          status: 'invalid',
          errorMessage: validation.errorMessage ?? `Invalid ${BYOK_PROVIDER_LABELS[provider]} API key.`,
          diagnosticSteps: validation.diagnosticSteps ?? [],
          lastCheck: Date.now(),
        }));
        return {
          ok: false,
          errorMessage: validation.errorMessage ?? `Invalid ${BYOK_PROVIDER_LABELS[provider]} API key.`,
        };
      }

      const blob = await BYOKKeyManager.saveKey(provider, rawApiKey);
      BYOKKeyManager.touchValidation(provider);

      setState((prev) => ({
        ...prev,
        isSaving: false,
        status: validation.status,
        fingerprint: blob.fingerprint,
        lastCheck: Date.now(),
        errorMessage: validation.errorMessage ?? null,
        diagnosticSteps: validation.diagnosticSteps ?? [],
      }));

      return { ok: true };
    },
    [provider]
  );

  const revokeKey = useCallback(() => {
    BYOKKeyManager.revokeKey(provider);
    setState((prev) => ({
      ...prev,
      status: 'missing',
      fingerprint: null,
      lastCheck: Date.now(),
      errorMessage: null,
      diagnosticSteps: [],
    }));
  }, [provider]);

  const revalidate = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true }));
    await hydrate();
  }, [hydrate]);

  const requiresSetup = useMemo(() => {
    return state.status === 'missing' || state.status === 'invalid';
  }, [state.status]);

  return {
    ...state,
    requiresSetup,
    saveKey,
    revokeKey,
    revalidate,
  };
};
