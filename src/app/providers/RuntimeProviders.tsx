import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { KeyHealthStatus } from '../../byok/types';
import { useSetByokStateAction } from '../../hooks/store/useAppActions';
import { i18nRuntime } from '../../i18n';
import type { Locale } from '../../i18n';

interface RuntimeProviderValue {
  activeLocale: Locale;
}

const RuntimeProviderContext = createContext<RuntimeProviderValue>({
  activeLocale: i18nRuntime.getLocale() as Locale,
});

interface RuntimeProvidersProps {
  byokStatus: KeyHealthStatus;
  byokFingerprint: string | null;
  workspaceRuntimeId: string;
  children: React.ReactNode;
}

export const RuntimeProviders: React.FC<RuntimeProvidersProps> = ({
  byokStatus,
  byokFingerprint,
  workspaceRuntimeId,
  children,
}) => {
  const setByokState = useSetByokStateAction();
  const [activeLocale, setActiveLocale] = useState<Locale>(() =>
    i18nRuntime.resolveLocale({
      userLocale: i18nRuntime.getLocale(),
      workspaceLocale: i18nRuntime.getWorkspaceLocaleOverride(workspaceRuntimeId),
    })
  );

  useEffect(() => {
    setByokState(byokStatus, byokFingerprint);
  }, [byokFingerprint, byokStatus, setByokState]);

  useEffect(() => {
    const refreshLocale = () => {
      const resolved = i18nRuntime.resolveLocale({
        userLocale: i18nRuntime.getLocale(),
        workspaceLocale: i18nRuntime.getWorkspaceLocaleOverride(workspaceRuntimeId),
      });
      setActiveLocale(resolved);
      i18nRuntime.applyLocaleDirection(resolved);
    };

    const unsubscribe = i18nRuntime.subscribe(() => refreshLocale());
    refreshLocale();
    return unsubscribe;
  }, [workspaceRuntimeId]);

  const value = useMemo(
    () => ({
      activeLocale,
    }),
    [activeLocale]
  );

  return <RuntimeProviderContext.Provider value={value}>{children}</RuntimeProviderContext.Provider>;
};

export const useRuntimeProviders = (): RuntimeProviderValue => {
  return useContext(RuntimeProviderContext);
};
