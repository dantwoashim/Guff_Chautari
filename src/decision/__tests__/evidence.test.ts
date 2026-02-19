import { describe, expect, it } from 'vitest';
import type { Message } from '../../../types';
import { buildDecisionEvidence, evidenceByType } from '../evidence';
import type { MemoryHit } from '../../engine/pipeline/types';

const history: Message[] = [
  {
    id: 'h-1',
    role: 'user',
    text: 'I care about weekly benchmark visibility.',
    timestamp: Date.UTC(2026, 5, 8, 10, 0, 0),
  },
  {
    id: 'h-2',
    role: 'model',
    text: 'Your best channel is where feedback loops are fastest.',
    timestamp: Date.UTC(2026, 5, 8, 10, 5, 0),
  },
];

const memories: MemoryHit[] = [
  {
    id: 'm-1',
    content: 'User prefers benchmark-driven plans and weekly scorecards.',
    type: 'semantic',
    score: 0.91,
    emotionalValence: 0.3,
    timestamp: Date.UTC(2026, 5, 7, 9, 0, 0),
    timestampIso: '2026-06-07T09:00:00.000Z',
    provenanceMessageIds: ['h-1'],
  },
];

describe('decision evidence', () => {
  it('builds evidence panel entries from memory and history with provenance', () => {
    const evidence = buildDecisionEvidence({
      memories,
      history,
      now_iso: '2026-06-08T12:00:00.000Z',
      limit: 5,
    });

    expect(evidence.length).toBeGreaterThanOrEqual(3);
    expect(evidence.some((entry) => entry.type === 'memory')).toBe(true);
    expect(evidence.some((entry) => entry.type === 'history')).toBe(true);

    const grouped = evidenceByType(evidence);
    expect(grouped.memory[0].provenance_message_ids).toContain('h-1');
  });
});
