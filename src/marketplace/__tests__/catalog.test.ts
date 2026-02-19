import { describe, expect, it } from 'vitest';
import { curatedPersonaTemplates, curatedTemplates, curatedWorkflowTemplates } from '../catalog';

describe('marketplace curated catalog', () => {
  it('ships at least 10 curated templates split across persona and workflow', () => {
    expect(curatedPersonaTemplates.length).toBeGreaterThanOrEqual(5);
    expect(curatedWorkflowTemplates.length).toBeGreaterThanOrEqual(5);
    expect(curatedTemplates.length).toBeGreaterThanOrEqual(10);
  });
});
