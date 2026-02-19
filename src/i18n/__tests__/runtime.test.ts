import { beforeEach, describe, expect, it } from 'vitest';
import { I18nRuntime, isRtlLocale } from '../runtime';

describe('i18n runtime', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.body.classList.remove('ashim-rtl');
    document.documentElement.removeAttribute('dir');
    document.documentElement.removeAttribute('lang');
  });

  it('switches locale and resolves translated strings with interpolation', () => {
    const runtime = new I18nRuntime('en');
    expect(runtime.t('app.install.action')).toBe('Install');

    runtime.setLocale('es');
    expect(runtime.t('app.install.action')).toBe('Instalar');
    expect(
      runtime.t('app.mode.label', { values: { mode: 'Companion' } })
    ).toContain('Companion');
  });

  it('uses locale fallback chain for regional tags', () => {
    const runtime = new I18nRuntime('en');
    const resolved = runtime.resolveLocale({
      browserLocale: 'es-MX',
    });
    expect(resolved).toBe('es');

    const unresolved = runtime.resolveLocale({
      browserLocale: 'fr-CA',
    });
    expect(unresolved).toBe('en');
  });

  it('supports workspace locale override and rtl layout direction', () => {
    const runtime = new I18nRuntime('en');
    runtime.setWorkspaceLocaleOverride('workspace-1', 'ar');
    const resolved = runtime.resolveLocale({
      userLocale: runtime.getLocale(),
      workspaceLocale: runtime.getWorkspaceLocaleOverride('workspace-1'),
    });

    expect(resolved).toBe('ar');
    runtime.applyLocaleDirection(resolved);
    expect(document.documentElement.dir).toBe('rtl');
    expect(isRtlLocale(resolved)).toBe(true);
  });
});
