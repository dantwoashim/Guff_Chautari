import { describe, expect, it } from 'vitest';
import {
  buildPersonaCulturalInstrumentation,
  getPersonaCulturalContext,
} from '../culturalContext';

describe('persona cultural context', () => {
  it('uses formal defaults for Japanese locale and casual defaults for US English', () => {
    const ja = getPersonaCulturalContext('ja');
    const en = getPersonaCulturalContext('en');

    expect(ja.defaultFormality).toBe('formal');
    expect(en.defaultFormality).toBe('casual');
  });

  it('builds prompt instrumentation with locale-specific instructions', () => {
    const instrumentation = buildPersonaCulturalInstrumentation({
      locale: 'ja',
      personaName: 'Research Partner',
    });

    expect(instrumentation).toContain('Locale context for Research Partner: ja');
    expect(instrumentation).toContain('Default formality: formal');
    expect(instrumentation).toContain('Time format: 24h');
  });
});
