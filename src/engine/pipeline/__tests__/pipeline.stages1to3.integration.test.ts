import { describe, expect, it } from 'vitest';
import type { Memory, Message } from '../../../../types';
import type { PipelineInput } from '../types';
import { createContextGatherer } from '../stages/contextGatherer';
import { createIdentityResolver } from '../stages/identityResolver';
import { createEmotionalProcessor } from '../stages/emotionalProcessor';

const makeMessage = (id: string, role: Message['role'], text: string, timestamp: number): Message => ({
  id,
  role,
  text,
  timestamp,
});

const makeMemory = (id: string, content: string, timestamp: number): Memory => ({
  id,
  content,
  type: 'episodic',
  embedding: [0.1, 0.2, 0.3],
  timestamp,
  decayFactor: 0.05,
  connections: [],
  emotionalValence: 0.1,
  metadata: {},
});

describe('pipeline stages 1-3 integration', () => {
  it('produces valid emotional state from raw user message', async () => {
    const baseTime = Date.UTC(2026, 3, 9, 13, 45, 0);
    const history = [
      makeMessage('h-1', 'user', 'I am trying to improve my sleep routine.', baseTime - 400_000),
      makeMessage('h-2', 'model', 'We can set a stable bedtime and wind-down plan.', baseTime - 350_000),
      makeMessage('h-3', 'user', 'I keep checking my phone at night.', baseTime - 300_000),
    ];

    const memories = [
      makeMemory('mem-1', 'User wants a stable sleep routine and less phone usage at night.', baseTime - 86_400_000),
      makeMemory('mem-2', 'User responds well to concrete, step-by-step plans.', baseTime - 172_800_000),
      makeMemory('mem-3', 'User has stress spikes in evening hours.', baseTime - 259_200_000),
    ];

    const contextGatherer = createContextGatherer({
      loadHistory: async () => history,
      loadMemories: async () => memories,
      loadPersona: async () => ({
        id: 'persona-1',
        name: 'Ashim',
        systemInstruction: 'Be practical and warm.',
        emotionalDebt: 35,
        attachmentStyle: 'secure',
      }),
      embedQuery: async () => [0.4, 0.3, 0.2],
      now: () => new Date(baseTime),
    });

    const identityResolver = createIdentityResolver();
    const emotionalProcessor = createEmotionalProcessor();

    const input: PipelineInput = {
      threadId: 'thread-1',
      userId: 'user-1',
      personaId: 'persona-1',
      userMessage: makeMessage('latest', 'user', 'I feel overwhelmed at night, can we fix this?', baseTime),
      timestamp: baseTime,
    };

    const stage1 = await contextGatherer.run(input);
    const stage2 = await identityResolver.run(stage1);
    const stage3 = await emotionalProcessor.run(stage2);

    expect(stage1.context.memories.length).toBeGreaterThanOrEqual(3);
    expect(stage2.identity.variant).toBeTruthy();
    expect(stage3.emotional).toBeDefined();
    expect(stage3.emotional.dischargeRisk).toBeGreaterThanOrEqual(0);
    expect(stage3.emotional.dischargeRisk).toBeLessThanOrEqual(1);
  });
});
