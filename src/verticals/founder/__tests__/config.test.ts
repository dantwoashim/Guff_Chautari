import { describe, expect, it } from 'vitest';
import { founderVerticalConfig } from '../config';

describe('founder vertical config', () => {
  it('defines all four vertical layers and expected founder modules', () => {
    expect(founderVerticalConfig.id).toBe('founder_os');
    expect(founderVerticalConfig.persona.name).toContain('Execution');
    expect(founderVerticalConfig.workflows.length).toBeGreaterThanOrEqual(4);
    expect(founderVerticalConfig.knowledgeTemplates.length).toBeGreaterThanOrEqual(3);
    expect(founderVerticalConfig.decisionPresets.length).toBeGreaterThanOrEqual(2);
    expect(founderVerticalConfig.uiPanels).toContain('founder_dashboard');
  });
});
