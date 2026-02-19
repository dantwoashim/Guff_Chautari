import { describe, expect, it } from 'vitest';
import { researchVerticalConfig } from '../config';

describe('research vertical config', () => {
  it('activates research workflows, templates, and safety boundaries', () => {
    expect(researchVerticalConfig.id).toBe('research_writing_lab');
    expect(researchVerticalConfig.workflows.length).toBeGreaterThanOrEqual(4);
    expect(researchVerticalConfig.knowledgeTemplates.length).toBeGreaterThanOrEqual(3);
    expect(researchVerticalConfig.decisionPresets.length).toBeGreaterThanOrEqual(2);
    expect(
      researchVerticalConfig.safetyBoundaries.some((rule) =>
        rule.rule.toLowerCase().includes('fabricated citations')
      )
    ).toBe(true);
    expect(researchVerticalConfig.uiPanels).toContain('research_dashboard');
  });
});
