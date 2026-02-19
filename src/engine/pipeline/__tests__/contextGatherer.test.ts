import { describe, expect, it } from 'vitest';
import type { Memory, Message } from '../../../../types';
import type { PipelineInput } from '../types';
import { createContextGatherer } from '../stages/contextGatherer';

const makeMessage = (id: string, role: Message['role'], text: string, timestamp: number): Message => ({
  id,
  role,
  text,
  timestamp,
});

const makeMemory = (id: string, content: string, timestamp: number): Memory => ({
  id,
  content,
  type: 'semantic',
  embedding: [0.1, 0.2],
  timestamp,
  decayFactor: 0.1,
  connections: [],
  emotionalValence: 0.2,
  metadata: {},
});

describe('contextGatherer', () => {
  it('returns enriched context with at least three memory hits', async () => {
    const baseTime = Date.UTC(2026, 3, 7, 9, 0, 0);
    const history: Message[] = [
      makeMessage('m-1', 'user', 'I need help planning my product launch.', baseTime - 86_400_000),
      makeMessage('m-2', 'model', 'Let us map launch milestones.', baseTime - 85_000_000),
      makeMessage('m-3', 'user', 'Revenue target is 20k this quarter.', baseTime - 84_000_000),
    ];

    const memories: Memory[] = [
      makeMemory('mem-1', 'User is preparing a product launch with milestones.', baseTime - 86_400_000 * 2),
      makeMemory('mem-2', 'User has quarterly revenue target of 20k.', baseTime - 86_400_000 * 3),
    ];

    const stage = createContextGatherer({
      loadHistory: async () => history,
      loadPersona: async () => ({
        id: 'persona-1',
        name: 'Ashim',
        systemInstruction: 'You are strategic and practical.',
      }),
      loadMemories: async () => memories,
      embedQuery: async () => [0.5, 0.2, 0.1],
      now: () => new Date(baseTime),
    });

    const input: PipelineInput = {
      threadId: 'thread-1',
      userId: 'user-1',
      personaId: 'persona-1',
      userMessage: makeMessage('latest', 'user', 'How do I prioritize launch tasks this week?', baseTime),
      timestamp: baseTime,
    };

    const result = await stage.run(input);

    expect(result.context.time.period).toBe('morning');
    expect(result.context.memories.length).toBeGreaterThanOrEqual(3);
    expect(result.context.relationship.messageCount).toBe(history.length);
    expect(result.context.persona.name).toBe('Ashim');
    expect(result.context.linguistic).toBeDefined();
    expect(result.context.temporal).toBeDefined();
    expect(result.context.linguistic?.activeRegister).toBeDefined();
    expect(typeof result.context.temporal?.energyLevel).toBe('number');
  });
});
