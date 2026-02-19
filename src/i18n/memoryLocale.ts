import type { Locale } from './types';

export interface LocaleMemoryImportanceInput {
  locale: Locale;
  text: string;
  baseImportance: number;
}

export interface LocaleCitationInput {
  locale: Locale;
  sourceTitle: string;
  sourceType?: string;
  year?: string;
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const LOCALE_IMPORTANCE_SIGNALS: Record<Locale, RegExp[]> = {
  en: [/\bdeadline\b/i, /\bcommitment\b/i, /\bimportant\b/i],
  es: [/\bimportante\b/i, /\bcompromiso\b/i, /\bfecha límite\b/i],
  hi: [/\bजरूरी\b/, /\bप्रतिबद्धता\b/, /\bडेडलाइन\b/i],
  ja: [/\b重要\b/, /\b締切\b/, /\b約束\b/],
  ar: [/\bمهم\b/, /\bموعد\b/, /\bالتزام\b/],
};

export const scoreLocaleMemoryImportance = (
  input: LocaleMemoryImportanceInput
): number => {
  const signals = LOCALE_IMPORTANCE_SIGNALS[input.locale] ?? [];
  const bonusHits = signals.reduce((count, pattern) => (pattern.test(input.text) ? count + 1 : count), 0);
  const bonus = Math.min(0.25, bonusHits * 0.08);
  return Number(clamp(input.baseImportance + bonus, 0, 1).toFixed(4));
};

export const renderUtcTimestampForLocale = (payload: {
  utcIso: string;
  locale: Locale;
  timeZone?: string;
}): string => {
  const date = new Date(payload.utcIso);
  return new Intl.DateTimeFormat(payload.locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: payload.timeZone,
  }).format(date);
};

export const formatCitationByLocale = (payload: LocaleCitationInput): string => {
  const year = payload.year?.trim() || 'n.d.';
  if (payload.locale === 'ja') {
    return `［${payload.sourceTitle}, ${year}］`;
  }
  if (payload.locale === 'ar') {
    return `${payload.sourceTitle} (${year})`;
  }
  if (payload.locale === 'es') {
    return `${payload.sourceTitle} (${year})`;
  }
  if (payload.locale === 'hi') {
    return `${payload.sourceTitle} (${year})`;
  }
  return `${payload.sourceTitle} (${year})`;
};
