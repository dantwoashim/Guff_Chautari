import { beforeEach, describe, expect, it } from 'vitest';
import { careerVerticalConfig } from '../career/config';
import {
  listCustomVerticalRegistry,
  registerCustomVerticalConfig,
} from '../customRegistry';
import { verticalRuntime } from '../runtime';

const STORAGE_KEY = 'ashim.verticals.custom-registry.v1';

describe('custom vertical registry', () => {
  beforeEach(() => {
    verticalRuntime.resetForTests();
    window.localStorage.removeItem(STORAGE_KEY);
  });

  it('validates and registers custom vertical configs for activation', () => {
    const result = registerCustomVerticalConfig({
      config: {
        ...careerVerticalConfig,
        id: 'community-career-pro',
        name: 'Community Career Pro',
      },
      createdByUserId: 'creator-99',
      nowIso: '2026-02-18T14:00:00.000Z',
    });

    expect(result.ok).toBe(true);
    expect(result.config?.source).toBe('community');
    expect(listCustomVerticalRegistry().some((entry) => entry.id === 'community-career-pro')).toBe(true);
    expect(verticalRuntime.getConfig('community-career-pro')).not.toBeNull();
  });

  it('rejects invalid custom configs with explicit issues', () => {
    const result = registerCustomVerticalConfig({
      config: {
        ...careerVerticalConfig,
        id: 'bad id',
      },
      createdByUserId: 'creator-100',
    });

    expect(result.ok).toBe(false);
    expect(result.issues?.some((issue) => issue.includes('slug format'))).toBe(true);
  });
});
