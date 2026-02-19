import { describe, expect, it } from 'vitest';
import {
  ingestKnowledgeFromUrl,
  KnowledgeGraphStore,
  createInMemoryKnowledgeStoreAdapter,
} from '../index';

describe('knowledge url ingestion', () => {
  it('fetches html, extracts readable text, and stores url source', async () => {
    const store = new KnowledgeGraphStore(createInMemoryKnowledgeStoreAdapter());

    const result = await ingestKnowledgeFromUrl(
      {
        userId: 'user-url-ingestion',
        url: 'https://example.com/article',
      },
      store,
      {
        fetchHtml: async () => ({
          ok: true,
          status: 200,
          text: async () =>
            `
            <html>
              <head><title>Execution Playbook</title></head>
              <body>
                <article>
                  <h1>Execution Playbook</h1>
                  <p>This article explains practical weekly execution loops with measurable checkpoints.</p>
                  <p>Teams should avoid vague goals and track concrete outcomes every Friday.</p>
                </article>
              </body>
            </html>
            `,
        }),
      }
    );

    expect(result.source.type).toBe('url');
    expect(result.source.title).toBe('Execution Playbook');
    expect(result.nodes.length).toBeGreaterThan(0);
  });
});
