import type { Locale } from './types';

export interface PersonaCulturalContext {
  locale: Locale;
  communicationStyle: 'direct' | 'balanced' | 'indirect';
  defaultFormality: 'casual' | 'neutral' | 'formal';
  preferredTimeFormat: '12h' | '24h';
  calendarNotes: string[];
  holidays: string[];
}

const CONTEXT_BY_LOCALE: Record<Locale, PersonaCulturalContext> = {
  en: {
    locale: 'en',
    communicationStyle: 'direct',
    defaultFormality: 'casual',
    preferredTimeFormat: '12h',
    calendarNotes: ['Use Gregorian calendar defaults', 'Week starts on Sunday in most US contexts'],
    holidays: ['New Year', 'Thanksgiving', 'Independence Day'],
  },
  es: {
    locale: 'es',
    communicationStyle: 'balanced',
    defaultFormality: 'neutral',
    preferredTimeFormat: '24h',
    calendarNotes: ['Prefer date-first formatting', 'Use region-aware phrasing for Spain/LatAm'],
    holidays: ['Año Nuevo', 'Navidad'],
  },
  hi: {
    locale: 'hi',
    communicationStyle: 'balanced',
    defaultFormality: 'neutral',
    preferredTimeFormat: '12h',
    calendarNotes: ['Support culturally familiar examples', 'Avoid idioms that do not localize well'],
    holidays: ['Diwali', 'Holi'],
  },
  ja: {
    locale: 'ja',
    communicationStyle: 'indirect',
    defaultFormality: 'formal',
    preferredTimeFormat: '24h',
    calendarNotes: ['Prefer polite, deferential phrasing', 'Use concise, structured recommendations'],
    holidays: ['Golden Week', 'New Year'],
  },
  ar: {
    locale: 'ar',
    communicationStyle: 'balanced',
    defaultFormality: 'formal',
    preferredTimeFormat: '12h',
    calendarNotes: ['Ensure RTL readability', 'Prefer respectful and context-rich phrasing'],
    holidays: ['Eid al-Fitr', 'Eid al-Adha'],
  },
};

export const getPersonaCulturalContext = (locale: Locale): PersonaCulturalContext => {
  return {
    ...CONTEXT_BY_LOCALE[locale],
    calendarNotes: [...CONTEXT_BY_LOCALE[locale].calendarNotes],
    holidays: [...CONTEXT_BY_LOCALE[locale].holidays],
  };
};

export const buildPersonaCulturalInstrumentation = (payload: {
  locale: Locale;
  personaName: string;
}): string => {
  const context = getPersonaCulturalContext(payload.locale);
  return [
    `Locale context for ${payload.personaName}: ${payload.locale}`,
    `Communication style: ${context.communicationStyle}`,
    `Default formality: ${context.defaultFormality}`,
    `Time format: ${context.preferredTimeFormat}`,
    `Calendar notes: ${context.calendarNotes.join('; ')}`,
    `Holiday awareness: ${context.holidays.join(', ')}`,
  ].join('\n');
};
