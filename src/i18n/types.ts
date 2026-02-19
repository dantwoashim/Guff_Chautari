export type Locale = 'en' | 'es' | 'hi' | 'ja' | 'ar';

export type TextDirection = 'ltr' | 'rtl';

export interface LocaleConfig {
  locale: Locale;
  languageName: string;
  englishName: string;
  direction: TextDirection;
  hourCycle: 'h12' | 'h24';
  dateStyle: 'short' | 'medium' | 'long';
  numberingSystem?: string;
}

export interface TranslationPluralRule {
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
}

export type TranslationMessage = string | TranslationPluralRule;

export interface TranslationBundle {
  locale: Locale;
  messages: Record<string, TranslationMessage>;
}

export interface TranslationParams {
  count?: number;
  values?: Record<string, string | number>;
}

export interface LocaleResolutionInput {
  browserLocale?: string;
  userLocale?: string;
  workspaceLocale?: string | null;
}
