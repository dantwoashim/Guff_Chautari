import { describe, expect, it } from 'vitest';
import { createGDocsConnector } from '../gdocs/gdocsConnector';

describe('gdocsConnector', () => {
  it('lists, reads, appends, and creates documents', async () => {
    const connector = createGDocsConnector();

    const listResult = await connector.execute('list_documents', {
      userId: 'gdocs-user',
      payload: { limit: 5 },
    });

    expect(listResult.ok).toBe(true);
    const documents = listResult.data?.documents as Array<{ id: string; title: string }>;
    expect(Array.isArray(documents)).toBe(true);
    expect(documents.length).toBeGreaterThan(0);

    const readResult = await connector.execute('read_document', {
      userId: 'gdocs-user',
      payload: { documentId: documents[0].id },
    });

    expect(readResult.ok).toBe(true);
    expect(readResult.data?.document).toEqual(
      expect.objectContaining({
        id: documents[0].id,
        content: expect.any(String),
      })
    );

    const appendResult = await connector.execute('append_to_document', {
      userId: 'gdocs-user',
      payload: {
        documentId: documents[0].id,
        appendText: 'Additional execution notes.',
      },
    });

    expect(appendResult.ok).toBe(true);
    expect(String((appendResult.data?.document as { content: string }).content)).toContain(
      'Additional execution notes.'
    );

    const createResult = await connector.execute('create_document', {
      userId: 'gdocs-user',
      payload: {
        title: 'New Synthesized Brief',
        content: 'Initial draft content',
      },
    });

    expect(createResult.ok).toBe(true);
    expect(createResult.data?.document).toEqual(
      expect.objectContaining({
        title: 'New Synthesized Brief',
      })
    );
  });
});
