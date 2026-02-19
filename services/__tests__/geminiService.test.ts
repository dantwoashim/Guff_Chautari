import { describe, expect, it } from 'vitest';
import type { Message } from '../../types';
import { formatHistory } from '../geminiService';

describe('geminiService', () => {
  it('formats chat history into model content format', () => {
    const messages: Message[] = [
      { id: '1', role: 'user', text: 'hello', timestamp: 1 },
      { id: '2', role: 'model', text: 'hi there', timestamp: 2 },
    ];

    const formatted = formatHistory(messages);

    expect(formatted).toEqual([
      { role: 'user', parts: [{ text: 'hello' }] },
      { role: 'model', parts: [{ text: 'hi there' }] },
    ]);
  });
});
