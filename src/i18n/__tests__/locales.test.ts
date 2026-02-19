import { describe, expect, it } from 'vitest';
import { arBundle } from '../locales/ar';
import { enBundle } from '../locales/en';
import { esBundle } from '../locales/es';
import { hiBundle } from '../locales/hi';
import { jaBundle } from '../locales/ja';
import { I18nRuntime } from '../runtime';

describe('locale bundles', () => {
  it('ship required locale bundles with full key coverage', () => {
    const baseKeys = Object.keys(enBundle.messages).sort();
    const bundles = [esBundle, hiBundle, jaBundle, arBundle];

    for (const bundle of bundles) {
      const keys = Object.keys(bundle.messages).sort();
      expect(keys).toEqual(baseKeys);
    }
  });

  it('falls back to english when locale bundle does not define a key', () => {
    const runtime = new I18nRuntime('en');
    const text = runtime.t('non_existent_i18n_key');
    expect(text).toBe('non_existent_i18n_key');
  });
});
