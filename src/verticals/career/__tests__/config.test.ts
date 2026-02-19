import { describe, expect, it } from 'vitest';
import { careerVerticalConfig } from '../config';

describe('career vertical config', () => {
  it('defines career strategist persona and complete module stack', () => {
    expect(careerVerticalConfig.id).toBe('career_studio');
    expect(careerVerticalConfig.persona.name).toContain('Career Strategist');
    expect(careerVerticalConfig.workflows.length).toBeGreaterThanOrEqual(4);
    expect(careerVerticalConfig.knowledgeTemplates.length).toBeGreaterThanOrEqual(3);
    expect(careerVerticalConfig.decisionPresets.length).toBeGreaterThanOrEqual(2);
    expect(careerVerticalConfig.uiPanels).toContain('career_dashboard');
    expect(
      careerVerticalConfig.safetyBoundaries.some((boundary) =>
        boundary.rule.toLowerCase().includes('guarantee')
      )
    ).toBe(true);
  });
});
