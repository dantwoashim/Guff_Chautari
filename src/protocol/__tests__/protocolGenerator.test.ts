import { describe, expect, it } from 'vitest';
import { generatePersonalProtocol } from '../protocolGenerator';

describe('generatePersonalProtocol', () => {
  it('builds a weekly protocol with seven days and at least three activities per day', () => {
    const protocol = generatePersonalProtocol({
      userId: 'user-1',
      workspaceId: 'workspace-1',
      nowIso: '2026-04-01T08:00:00.000Z',
      values: [
        {
          id: 'value-deep-work',
          title: 'Deep Work',
          description: 'Focus on leverage tasks.',
          confidence: 0.9,
          evidence: ['Workflow completed'],
        },
        {
          id: 'value-reliability',
          title: 'Reliability',
          description: 'Close loops consistently.',
          confidence: 0.82,
          evidence: ['Daily check-ins'],
        },
      ],
      goals: ['Ship weekly product brief'],
    });

    expect(protocol.days).toHaveLength(7);
    expect(protocol.days.every((day) => day.activities.length >= 3)).toBe(true);
    expect(
      protocol.days.some((day) =>
        day.activities.some((activity) => activity.type === 'decision_framework')
      )
    ).toBe(true);
  });
});
