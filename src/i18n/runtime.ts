import { arBundle } from './locales/ar';
import { enBundle } from './locales/en';
import { esBundle } from './locales/es';
import { hiBundle } from './locales/hi';
import { jaBundle } from './locales/ja';
import type {
  Locale,
  LocaleConfig,
  LocaleResolutionInput,
  TranslationBundle,
  TranslationMessage,
  TranslationParams,
} from './types';

const LOCALE_STORAGE_KEY = 'ashim.i18n.locale.v1';
const WORKSPACE_OVERRIDE_KEY = 'ashim.i18n.workspace-overrides.v1';

const SUPPORTED_LOCALES: Locale[] = ['en', 'es', 'hi', 'ja', 'ar'];

const BUNDLES: Record<Locale, TranslationBundle> = {
  en: enBundle,
  es: esBundle,
  hi: hiBundle,
  ja: jaBundle,
  ar: arBundle,
};

const LOCALE_CONFIGS: Record<Locale, LocaleConfig> = {
  en: {
    locale: 'en',
    languageName: 'English',
    englishName: 'English',
    direction: 'ltr',
    hourCycle: 'h12',
    dateStyle: 'medium',
  },
  es: {
    locale: 'es',
    languageName: 'Espanol',
    englishName: 'Spanish',
    direction: 'ltr',
    hourCycle: 'h24',
    dateStyle: 'medium',
  },
  hi: {
    locale: 'hi',
    languageName: 'हिंदी',
    englishName: 'Hindi',
    direction: 'ltr',
    hourCycle: 'h12',
    dateStyle: 'medium',
  },
  ja: {
    locale: 'ja',
    languageName: '日本語',
    englishName: 'Japanese',
    direction: 'ltr',
    hourCycle: 'h24',
    dateStyle: 'long',
  },
  ar: {
    locale: 'ar',
    languageName: 'العربية',
    englishName: 'Arabic',
    direction: 'rtl',
    hourCycle: 'h12',
    dateStyle: 'medium',
    numberingSystem: 'arab',
  },
};

type LocaleListener = (locale: Locale) => void;

const canUseStorage = (): boolean =>
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const normalizeLocaleTag = (value: string | undefined): string => {
  if (!value) return '';
  return value.trim().toLowerCase().replace('_', '-');
};

const asSupportedLocale = (value: string | undefined): Locale | null => {
  const normalized = normalizeLocaleTag(value);
  if (!normalized) return null;
  if ((SUPPORTED_LOCALES as string[]).includes(normalized)) {
    return normalized as Locale;
  }
  const root = normalized.split('-')[0];
  if ((SUPPORTED_LOCALES as string[]).includes(root)) {
    return root as Locale;
  }
  return null;
};

const interpolate = (
  template: string,
  values: Record<string, string | number | undefined>
): string => {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, token: string) => {
    const value = values[token];
    if (value === undefined || value === null) return '';
    return String(value);
  });
};

const resolvePluralTemplate = (
  message: TranslationMessage,
  locale: Locale,
  count: number
): string => {
  if (typeof message === 'string') return message;

  const pluralRules = new Intl.PluralRules(locale);
  const category = pluralRules.select(count);
  if (category === 'zero' && message.zero) return message.zero;
  if (category === 'one' && message.one) return message.one;
  if (category === 'two' && message.two) return message.two;
  if (category === 'few' && message.few) return message.few;
  if (category === 'many' && message.many) return message.many;
  return message.other;
};

const readWorkspaceOverrides = (): Record<string, Locale> => {
  if (!canUseStorage()) return {};
  try {
    const raw = window.localStorage.getItem(WORKSPACE_OVERRIDE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    const entries = Object.entries(parsed).filter((entry): entry is [string, Locale] => {
      const locale = asSupportedLocale(entry[1]);
      return locale !== null;
    });
    return Object.fromEntries(entries);
  } catch {
    return {};
  }
};

const writeWorkspaceOverrides = (overrides: Record<string, Locale>): void => {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(WORKSPACE_OVERRIDE_KEY, JSON.stringify(overrides));
  } catch {
    // ignore storage failure
  }
};

export class I18nRuntime {
  private locale: Locale;
  private listeners = new Set<LocaleListener>();
  private workspaceOverrides: Record<string, Locale>;

  constructor(initialLocale?: Locale) {
    const storedLocale = canUseStorage()
      ? asSupportedLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY) ?? undefined)
      : null;
    this.locale = initialLocale ?? storedLocale ?? this.detectBrowserLocale();
    this.workspaceOverrides = readWorkspaceOverrides();
    this.applyDocumentDirection(this.locale);
  }

  detectBrowserLocale(): Locale {
    if (typeof navigator === 'undefined') return 'en';
    const candidates = [...(navigator.languages ?? []), navigator.language].filter(Boolean);
    for (const candidate of candidates) {
      const supported = asSupportedLocale(candidate);
      if (supported) return supported;
    }
    return 'en';
  }

  resolveLocale(input: LocaleResolutionInput = {}): Locale {
    const workspaceLocale = asSupportedLocale(input.workspaceLocale ?? undefined);
    if (workspaceLocale) return workspaceLocale;
    const userLocale = asSupportedLocale(input.userLocale);
    if (userLocale) return userLocale;
    const browserLocale = asSupportedLocale(input.browserLocale);
    if (browserLocale) return browserLocale;
    return 'en';
  }

  getLocale(): Locale {
    return this.locale;
  }

  setLocale(locale: Locale): Locale {
    this.locale = locale;
    if (canUseStorage()) {
      try {
        window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
      } catch {
        // ignore storage failure
      }
    }
    this.applyDocumentDirection(locale);
    this.emit();
    return locale;
  }

  getLocaleConfig(locale = this.locale): LocaleConfig {
    return LOCALE_CONFIGS[locale];
  }

  getSupportedLocales(): Locale[] {
    return [...SUPPORTED_LOCALES];
  }

  getWorkspaceLocaleOverride(workspaceId: string): Locale | null {
    return this.workspaceOverrides[workspaceId] ?? null;
  }

  setWorkspaceLocaleOverride(workspaceId: string, locale: Locale | null): void {
    const next = { ...this.workspaceOverrides };
    if (locale) {
      next[workspaceId] = locale;
    } else {
      delete next[workspaceId];
    }
    this.workspaceOverrides = next;
    writeWorkspaceOverrides(next);
    this.emit();
  }

  subscribe(listener: LocaleListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  t(
    key: string,
    params: TranslationParams & {
      locale?: Locale;
      values?: Record<string, string | number>;
    } = {}
  ): string {
    const locale = params.locale ?? this.locale;
    const bundle = BUNDLES[locale] ?? BUNDLES.en;
    const fallbackBundle = BUNDLES.en;
    const count = typeof params.count === 'number' ? params.count : 0;
    const message = bundle.messages[key] ?? fallbackBundle.messages[key];
    if (!message) return key;

    const template = resolvePluralTemplate(message, locale, count);
    return interpolate(template, {
      count,
      ...(params.values ?? {}),
    });
  }

  formatDateTime(payload: {
    utcIso: string;
    locale?: Locale;
    timeZone?: string;
    withTime?: boolean;
  }): string {
    const locale = payload.locale ?? this.locale;
    const config = this.getLocaleConfig(locale);
    const date = new Date(payload.utcIso);
    const formatter = new Intl.DateTimeFormat(locale, {
      dateStyle: config.dateStyle,
      timeStyle: payload.withTime === false ? undefined : 'short',
      hourCycle: config.hourCycle,
      timeZone: payload.timeZone,
    });
    return formatter.format(date);
  }

  formatNumber(value: number, locale = this.locale): string {
    const config = this.getLocaleConfig(locale);
    return new Intl.NumberFormat(locale, {
      numberingSystem: config.numberingSystem,
      maximumFractionDigits: 2,
    }).format(value);
  }

  applyLocaleDirection(locale: Locale): void {
    this.applyDocumentDirection(locale);
  }

  private applyDocumentDirection(locale: Locale): void {
    if (typeof document === 'undefined') return;
    const config = this.getLocaleConfig(locale);
    document.documentElement.lang = locale;
    document.documentElement.dir = config.direction;
    if (config.direction === 'rtl') {
      document.body.classList.add('ashim-rtl');
    } else {
      document.body.classList.remove('ashim-rtl');
    }
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.locale);
    }
  }
}

export const i18nRuntime = new I18nRuntime();

export const resolveCountSuffix = (count: number, locale: Locale): string => {
  if (locale === 'ja') return '';
  if (locale === 'ar') return count === 1 ? '' : 'ات';
  if (locale === 'es') return count === 1 ? '' : 's';
  if (locale === 'hi') return '';
  return count === 1 ? '' : 's';
};

export const isRtlLocale = (locale: Locale): boolean =>
  i18nRuntime.getLocaleConfig(locale).direction === 'rtl';
