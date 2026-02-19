import { describe, expect, it } from 'vitest';
import { extractCoreValues } from '../valuesExtractor';

describe('extractCoreValues', () => {
  it('extracts 5-7 core values with evidence from 60 days of activity', () => {
    const result = extractCoreValues({
      userId: 'user-1',
      nowIso: '2026-03-31T12:00:00.000Z',
      windowDays: 60,
      events: [
        {
          title: 'Workflow completed',
          description: 'Shipped launch checklist and retrospective',
          eventType: 'workflow.completed',
          category: 'workflow',
          createdAtIso: '2026-03-20T09:00:00.000Z',
        },
        {
          title: 'Decision review',
          description: 'Evaluated risk tradeoffs for pricing launch',
          eventType: 'decision.completed',
          category: 'decision',
          createdAtIso: '2026-03-18T11:00:00.000Z',
        },
        {
          title: 'Reflection log',
          description: 'Energy dropped after sleep debt',
          eventType: 'reflection.logged',
          category: 'reflection',
          createdAtIso: '2026-03-15T07:00:00.000Z',
        },
        {
          title: 'Knowledge note',
          description: 'Research summary on onboarding experiments',
          eventType: 'knowledge.note_added',
          category: 'knowledge',
          createdAtIso: '2026-03-12T14:00:00.000Z',
        },
      ],
      decisions: [
        {
          question: 'Should we launch now or wait two weeks?',
          selectedOption: 'Launch now with rollback guardrails',
          rationale: 'Keeps momentum while managing downside risk.',
          createdAtIso: '2026-03-18T11:05:00.000Z',
        },
      ],
      goals: [
        {
          title: 'Improve weekly deep work consistency',
          status: 'active',
          note: 'Protect two morning focus blocks daily.',
          updatedAtIso: '2026-03-21T09:00:00.000Z',
        },
        {
          title: 'Reduce burnout risk',
          status: 'active',
          note: 'Enforce recovery and sleep hygiene.',
          updatedAtIso: '2026-03-21T09:05:00.000Z',
        },
      ],
      reflections: [
        {
          text: 'I need better recovery and more consistent focus.',
          sentiment: 'negative',
          createdAtIso: '2026-03-15T07:30:00.000Z',
        },
      ],
    });

    expect(result.length).toBeGreaterThanOrEqual(5);
    expect(result.length).toBeLessThanOrEqual(7);
    expect(result.every((value) => value.evidence.length > 0)).toBe(true);
    expect(result.some((value) => value.title === 'Deep Work')).toBe(true);
  });
});
