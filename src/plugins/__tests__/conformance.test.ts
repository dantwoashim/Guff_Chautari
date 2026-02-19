import { describe, expect, it } from 'vitest';
import { listReferencePluginConformance } from '../runtime';

describe('plugin conformance suite', () => {
  it('validates all reference plugins', () => {
    const rows = listReferencePluginConformance();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.ok)).toBe(true);
  });
});
