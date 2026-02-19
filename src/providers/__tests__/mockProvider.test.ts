import { describe, expect, it } from 'vitest';
import { MockProvider } from '../mock/mockProvider';

describe('MockProvider', () => {
  it('streams deterministic responses without network', async () => {
    const provider = new MockProvider({
      id: 'mock-test',
      chunkSize: 8,
      defaultResponse: 'deterministic',
      responseByPrompt: {
        'hello there': 'custom hello response',
      },
    });

    const chunks: string[] = [];

    for await (const chunk of provider.streamChat({
      model: 'mock-chat',
      messages: [
        { role: 'system', content: 'be brief' },
        { role: 'user', content: 'hello there' },
      ],
    })) {
      chunks.push(chunk.text);
    }

    expect(chunks.join('')).toBe('custom hello response');
  });

  it('supports configurable failure modes', async () => {
    const provider = new MockProvider({
      failureModes: {
        streamChat: 'quota',
      },
    });

    await expect(async () => {
      for await (const _chunk of provider.streamChat({
        model: 'mock-chat',
        messages: [{ role: 'user', content: 'hi' }],
      })) {
        // no-op
      }
    }).rejects.toThrow('429 quota exceeded');
  });
});
