import React, { useEffect, useMemo, useState } from 'react';
import type { Locale } from '../../i18n';
import { i18nRuntime } from '../../i18n';

interface LocalePickerPanelProps {
  workspaceId: string;
}

const flagByLocale: Record<Locale, string> = {
  en: '🇺🇸',
  es: '🇪🇸',
  hi: '🇮🇳',
  ja: '🇯🇵',
  ar: '🇸🇦',
};

export const LocalePickerPanel: React.FC<LocalePickerPanelProps> = ({ workspaceId }) => {
  const [locale, setLocale] = useState<Locale>(() => i18nRuntime.getLocale());
  const [workspaceOverride, setWorkspaceOverride] = useState<Locale | null>(() =>
    i18nRuntime.getWorkspaceLocaleOverride(workspaceId)
  );

  useEffect(() => {
    return i18nRuntime.subscribe((next) => {
      setLocale(next);
      setWorkspaceOverride(i18nRuntime.getWorkspaceLocaleOverride(workspaceId));
    });
  }, [workspaceId]);

  const supportedLocales = i18nRuntime.getSupportedLocales();
  const activeLocale = workspaceOverride ?? locale;
  const activeConfig = i18nRuntime.getLocaleConfig(activeLocale);
  const browserLocale = useMemo(() => i18nRuntime.detectBrowserLocale(), []);

  return (
    <div className="h-full overflow-y-auto bg-[#0b141a] p-4">
      <div className="mx-auto max-w-5xl space-y-4">
        <section className="rounded-xl border border-[#313d45] bg-[#111b21] p-4">
          <h2 className="text-lg font-semibold text-[#e9edef]">{i18nRuntime.t('localePicker.title')}</h2>
          <p className="mt-1 text-sm text-[#9fb0b8]">{i18nRuntime.t('localePicker.description')}</p>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-xl border border-[#313d45] bg-[#111b21] p-4">
            <h3 className="mb-3 text-sm font-semibold text-[#e9edef]">{i18nRuntime.t('localePicker.current')}</h3>
            <div className="rounded border border-[#27343d] bg-[#0f171d] p-3 text-sm text-[#d7e1e7]">
              <p>
                {flagByLocale[activeLocale]} {i18nRuntime.t(`locale.${activeLocale}`)}
              </p>
              <p className="mt-1 text-xs text-[#8fa3af]">
                {i18nRuntime.t('localePicker.direction')}: {i18nRuntime.t(`localePicker.direction.${activeConfig.direction}`)}
              </p>
              <p className="text-xs text-[#8fa3af]">
                {i18nRuntime.t('localePicker.auto_detect')}: {i18nRuntime.t(`locale.${browserLocale}`)}
              </p>
            </div>

            <div className="mt-3 space-y-2">
              {supportedLocales.map((entry) => (
                <button
                  key={entry}
                  type="button"
                  className={`flex w-full items-center justify-between rounded border px-3 py-2 text-sm ${
                    locale === entry
                      ? 'border-[#00a884] bg-[#133a33] text-[#dffaf3]'
                      : 'border-[#2a3942] bg-[#0f171d] text-[#c8d6dd] hover:border-[#4d606c]'
                  }`}
                  onClick={() => {
                    i18nRuntime.setLocale(entry);
                    setLocale(entry);
                  }}
                >
                  <span>
                    {flagByLocale[entry]} {i18nRuntime.t(`locale.${entry}`)}
                  </span>
                  {locale === entry ? <span className="text-xs">Selected</span> : null}
                </button>
              ))}
            </div>
          </article>

          <article className="rounded-xl border border-[#313d45] bg-[#111b21] p-4">
            <h3 className="mb-3 text-sm font-semibold text-[#e9edef]">{i18nRuntime.t('localePicker.workspace_override')}</h3>
            <div className="space-y-2">
              {supportedLocales.map((entry) => (
                <button
                  key={`workspace-${entry}`}
                  type="button"
                  className={`flex w-full items-center justify-between rounded border px-3 py-2 text-sm ${
                    workspaceOverride === entry
                      ? 'border-[#7ed0f3] bg-[#12313f] text-[#d7f3ff]'
                      : 'border-[#2a3942] bg-[#0f171d] text-[#c8d6dd] hover:border-[#4d606c]'
                  }`}
                  onClick={() => {
                    i18nRuntime.setWorkspaceLocaleOverride(workspaceId, entry);
                    setWorkspaceOverride(entry);
                  }}
                >
                  <span>
                    {flagByLocale[entry]} {i18nRuntime.t(`locale.${entry}`)}
                  </span>
                  {workspaceOverride === entry ? <span className="text-xs">Override</span> : null}
                </button>
              ))}
            </div>

            <button
              type="button"
              className="mt-3 rounded border border-[#455761] px-3 py-1.5 text-xs text-[#c8d6dd] hover:bg-[#1a2730]"
              onClick={() => {
                i18nRuntime.setWorkspaceLocaleOverride(workspaceId, null);
                setWorkspaceOverride(null);
              }}
            >
              {i18nRuntime.t('localePicker.clear_override')}
            </button>
          </article>
        </section>

        <section className="rounded-xl border border-[#313d45] bg-[#111b21] p-4">
          <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">{i18nRuntime.t('localePicker.preview')}</h3>
          <p className="text-sm text-[#d7e1e7]">{i18nRuntime.t('app.install.prompt', { locale: activeLocale })}</p>
          <p className="mt-2 text-xs text-[#8fa3af]">
            {i18nRuntime.formatDateTime({
              utcIso: new Date().toISOString(),
              locale: activeLocale,
              withTime: true,
            })}{' '}
            • {i18nRuntime.formatNumber(12345.67, activeLocale)}
          </p>
        </section>
      </div>
    </div>
  );
};
