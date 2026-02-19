import { describe, expect, it } from 'vitest';
import {
  formatCitationByLocale,
  renderUtcTimestampForLocale,
  scoreLocaleMemoryImportance,
} from '../memoryLocale';

describe('memory locale behavior', () => {
  it('renders UTC timestamps in locale-aware formats', () => {
    const utcIso = '2026-02-18T15:30:00.000Z';
    const us = renderUtcTimestampForLocale({
      utcIso,
      locale: 'en',
      timeZone: 'America/Los_Angeles',
    });
    const jp = renderUtcTimestampForLocale({
      utcIso,
      locale: 'ja',
      timeZone: 'Asia/Tokyo',
    });

    expect(us).not.toEqual(jp);
    expect(us.length).toBeGreaterThan(0);
    expect(jp.length).toBeGreaterThan(0);
  });

  it('scores importance with locale-specific signals and formats citations', () => {
    const base = scoreLocaleMemoryImportance({
      locale: 'en',
      text: 'Track this commitment before the deadline.',
      baseImportance: 0.5,
    });
    expect(base).toBeGreaterThan(0.5);

    const citationJa = formatCitationByLocale({
      locale: 'ja',
      sourceTitle: 'Memory Systems Study',
      year: '2025',
    });
    const citationEn = formatCitationByLocale({
      locale: 'en',
      sourceTitle: 'Memory Systems Study',
      year: '2025',
    });
    expect(citationJa).not.toEqual(citationEn);
  });
});
