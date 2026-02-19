import { describe, expect, it } from 'vitest';
import { healthVerticalConfig } from '../config';
import { evaluateHealthSafetyQuery } from '../safety';

describe('health vertical config', () => {
  it('defines wellness companion pack with explicit safety boundaries', () => {
    expect(healthVerticalConfig.id).toBe('health_habit_planning');
    expect(healthVerticalConfig.workflows.length).toBeGreaterThanOrEqual(4);
    expect(healthVerticalConfig.knowledgeTemplates.length).toBeGreaterThanOrEqual(3);
    expect(healthVerticalConfig.decisionPresets.length).toBeGreaterThanOrEqual(2);
    expect(
      healthVerticalConfig.safetyBoundaries.some((boundary) =>
        boundary.rule.toLowerCase().includes('diagnosis')
      )
    ).toBe(true);
  });

  it('blocks medical advice / emergency prompts but allows habit planning prompts', () => {
    const emergency = evaluateHealthSafetyQuery({
      userMessage: 'I have chest pain and shortness of breath, what medication should I take right now?',
    });
    expect(emergency.blocked).toBe(true);
    expect(emergency.reason).toBe('emergency');
    expect(emergency.response.toLowerCase()).toContain('emergency');

    const routine = evaluateHealthSafetyQuery({
      userMessage: 'Help me plan a 7-day sleep and hydration routine.',
    });
    expect(routine.blocked).toBe(false);
    expect(routine.reason).toBe('safe');
  });
});
