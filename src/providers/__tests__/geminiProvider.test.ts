import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeminiProvider } from '../gemini/geminiProvider';

describe('GeminiProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('validates key via Gemini models endpoint', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ models: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const provider = new GeminiProvider();
    const result = await provider.validateKey('AIza-valid-key');

    expect(result.ok).toBe(true);
    expect(result.status).toBe('healthy');
  });

  it('streams chat output as chunks from generateContent response', async () => {
    const mockFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [{ text: 'Hello from Gemini adapter' }],
                },
              },
            ],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      );

    const provider = new GeminiProvider({
      apiKey: 'AIza-test-key',
      fetchFn: mockFetch,
      chunkSize: 6,
    });

    const chunks: string[] = [];
    for await (const chunk of provider.streamChat({
      model: 'gemini-2.5-flash',
      messages: [
        { role: 'system', content: 'Be concise.' },
        { role: 'user', content: 'Say hello.' },
      ],
    })) {
      chunks.push(chunk.text);
    }

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join('')).toBe('Hello from Gemini adapter');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(String(mockFetch.mock.calls[0][0])).toContain(':generateContent?key=');
  });

  it('embeds one or more inputs and returns vectors', async () => {
    const mockFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            embedding: {
              values: [0.01, 0.02, 0.03],
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            embedding: {
              values: [0.11, 0.12, 0.13],
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      );

    const provider = new GeminiProvider({
      apiKey: 'AIza-test-key',
      fetchFn: mockFetch,
    });

    const result = await provider.embed({
      model: 'text-embedding-004',
      input: ['first', 'second'],
    });

    expect(result.vectors).toEqual([
      [0.01, 0.02, 0.03],
      [0.11, 0.12, 0.13],
    ]);
    expect(result.dimensions).toBe(3);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(String(mockFetch.mock.calls[0][0])).toContain(':embedContent?key=');
  });

  it('sends multimodal parts when user message contains inline media', async () => {
    const mockFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [{ text: 'I can see the image.' }],
                },
              },
            ],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      );

    const provider = new GeminiProvider({
      apiKey: 'AIza-test-key',
      fetchFn: mockFetch,
    });

    const chunks: string[] = [];
    for await (const chunk of provider.streamChat({
      model: 'gemini-2.5-flash',
      messages: [
        { role: 'system', content: 'Be concise.' },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What is in this image?' },
            {
              type: 'inline_data',
              mimeType: 'image/png',
              data: 'ZmFrZS1iYXNlNjQ=',
            },
          ],
        },
      ],
    })) {
      chunks.push(chunk.text);
    }

    expect(chunks.join('')).toBe('I can see the image.');
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const requestBodyRaw = mockFetch.mock.calls[0][1]?.body;
    expect(typeof requestBodyRaw).toBe('string');
    const parsed = JSON.parse(String(requestBodyRaw));
    expect(parsed.system_instruction.parts[0].text).toContain('Be concise.');
    const firstContent = parsed.contents[0] as {
      parts: Array<{ inline_data?: { mime_type?: string } }>;
    };
    expect(firstContent.parts.some((part) => part.inline_data?.mime_type === 'image/png')).toBe(true);
  });
});
