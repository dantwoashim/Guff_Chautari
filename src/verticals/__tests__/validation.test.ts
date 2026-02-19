import { describe, expect, it } from 'vitest';
import { founderVerticalConfig } from '../founder/config';
import { normalizeVerticalConfig, validateVerticalConfig } from '../validation';

describe('vertical config validation', () => {
  it('accepts valid vertical configs', () => {
    const result = validateVerticalConfig(founderVerticalConfig);
    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('rejects malformed configs with explicit issues', () => {
    const result = validateVerticalConfig({
      ...founderVerticalConfig,
      id: 'bad id',
      workflows: [],
      knowledgeTemplates: [],
      decisionPresets: [],
      safetyBoundaries: [],
    });

    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.includes('id must use lowercase slug format'))).toBe(true);
    expect(result.issues.some((issue) => issue.includes('at least one workflow'))).toBe(true);
  });

  it('normalizes source/version defaults for marketplace publishing', () => {
    const normalized = normalizeVerticalConfig({
      ...founderVerticalConfig,
      source: undefined,
      version: undefined,
    });
    expect(normalized.source).toBe('built_in');
    expect(normalized.version).toBe('1.0.0');
  });
});
