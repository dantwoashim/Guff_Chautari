import { describe, expect, it } from 'vitest';
import { createProvenanceLinks, readProvenanceFromMetadata, toProvenanceDebugLines } from '../provenance';

describe('memory provenance', () => {
  it('creates provenance links from source messages', () => {
    const links = createProvenanceLinks('memory-1', [
      {
        id: 'msg-1',
        threadId: 'thread-1',
        role: 'user',
        text: 'I want to launch in July with weekly benchmarks.',
        timestamp: Date.UTC(2026, 5, 20, 9, 0, 0),
      },
    ]);

    expect(links.length).toBe(1);
    expect(links[0].messageId).toBe('msg-1');
    expect(links[0].threadId).toBe('thread-1');
    expect(links[0].memoryId).toBe('memory-1');
  });

  it('reads provenance from metadata and produces debug lines', () => {
    const metadata = {
      provenance: [
        {
          messageId: 'msg-7',
          threadId: 'thread-9',
          role: 'user',
          excerpt: 'Need tighter scope this week',
          createdAtIso: '2026-05-20T10:00:00.000Z',
        },
      ],
    };

    const links = readProvenanceFromMetadata('memory-2', metadata);
    const lines = toProvenanceDebugLines([
      {
        id: 'memory-2',
        content: 'User needs tighter weekly scope.',
        provenance: links,
      },
    ]);

    expect(links.length).toBe(1);
    expect(lines[0]).toContain('msg-7@thread-9');
    expect(lines[0]).toContain('memory-2');
  });
});

