import { describe, expect, it } from 'vitest';
import { extractMeetingActions } from '../actionExtractor';

describe('meeting action extractor', () => {
  it('extracts decisions, action items, questions, and topics from transcript', async () => {
    const transcript = [
      'We decided to prioritize onboarding automation this sprint.',
      'Action item: @mila will send follow-up email by 2026-03-11.',
      'Action item: Alex will schedule next meeting by Friday.',
      'Open question: should we split release by feature flag?',
    ].join('\n');

    const extracted = await extractMeetingActions({
      transcript,
      nowIso: '2026-03-07T12:00:00.000Z',
      preferStructured: false,
    });

    expect(extracted.method).toBe('heuristic');
    expect(extracted.decisions.length).toBeGreaterThan(0);
    expect(extracted.actionItems.length).toBeGreaterThanOrEqual(2);
    expect(extracted.questions.length).toBeGreaterThan(0);
    expect(extracted.topics.length).toBeGreaterThan(0);
    expect(extracted.actionItems.some((item) => item.assignee?.toLowerCase() === 'mila')).toBe(true);
    expect(extracted.actionItems.some((item) => typeof item.deadlineIso === 'string')).toBe(true);
  });

  it('uses structured extraction client when provided', async () => {
    const extracted = await extractMeetingActions({
      transcript: 'Transcript text for structured extraction.',
      nowIso: '2026-03-07T12:00:00.000Z',
      client: {
        extractStructured: async () => ({
          decisions: [{ text: 'Proceed with launch plan.', confidence: 0.93 }],
          actionItems: [{ text: 'Schedule launch review.', assignee: 'ops', confidence: 0.91 }],
          questions: [{ text: 'Any compliance blockers?', resolved: false }],
          topics: [{ label: 'launch', score: 0.96 }],
        }),
      },
    });

    expect(extracted.method).toBe('structured_llm');
    expect(extracted.decisions[0]?.text).toContain('launch plan');
    expect(extracted.actionItems[0]?.assignee).toBe('ops');
    expect(extracted.questions[0]?.resolved).toBe(false);
    expect(extracted.topics[0]?.label).toBe('launch');
  });
});

