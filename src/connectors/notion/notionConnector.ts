import type { Connector, ConnectorActionResult } from '../types';

interface MockNotionPage {
  id: string;
  title: string;
  content: string;
  lastEditedIso: string;
}

const defaultPages = (): MockNotionPage[] =>
  Array.from({ length: 8 }, (_, index) => ({
    id: `page-${index + 1}`,
    title:
      index % 2 === 0
        ? `Roadmap Note ${index + 1}`
        : `Research Document ${index + 1}`,
    content:
      index % 2 === 0
        ? 'Milestones, owners, and timeline adjustments for current sprint.'
        : 'Collected findings, references, and draft synthesis notes.',
    lastEditedIso: new Date(Date.now() - index * 24 * 60 * 60 * 1000).toISOString(),
  }));

const toResult = (summary: string, data: Record<string, unknown>): ConnectorActionResult => ({
  ok: true,
  summary,
  data,
});

export const createNotionConnector = (
  seedPages: ReadonlyArray<MockNotionPage> = defaultPages()
): Connector => {
  const pages = [...seedPages];

  return {
    manifest: {
      id: 'notion',
      name: 'Notion (Read)',
      version: '1.0.0',
      runtimeMode: 'mock',
      auth: {
        type: 'oauth',
        setupLabel: 'Connect Notion workspace',
      },
      actions: [
        {
          id: 'list_pages',
          title: 'List pages',
          description: 'List pages in workspace',
          mutation: false,
          idempotent: true,
        },
        {
          id: 'search_pages',
          title: 'Search pages',
          description: 'Search pages by title/content',
          mutation: false,
          idempotent: true,
        },
        {
          id: 'get_page',
          title: 'Get page',
          description: 'Read full page content',
          mutation: false,
          idempotent: true,
        },
        {
          id: 'update_page',
          title: 'Update page',
          description: 'Modify page content',
          mutation: true,
          idempotent: false,
          policyActionId: 'connector.permission.grant',
        },
      ],
    },
    async execute(actionId, context) {
      if (actionId === 'list_pages') {
        return toResult(`Loaded ${pages.length} page(s).`, { pages });
      }

      if (actionId === 'search_pages') {
        const query = String(context.payload.query ?? '').trim().toLowerCase();
        const matches = query
          ? pages.filter(
              (page) =>
                page.title.toLowerCase().includes(query) ||
                page.content.toLowerCase().includes(query)
            )
          : pages;
        return toResult(`Found ${matches.length} matching page(s).`, { pages: matches });
      }

      if (actionId === 'get_page') {
        const pageId = String(context.payload.pageId ?? '').trim();
        const page = pages.find((item) => item.id === pageId);
        if (!page) {
          return {
            ok: false,
            summary: 'Page not found.',
            errorMessage: `No page for id=${pageId}`,
          };
        }
        return toResult(`Loaded page ${page.id}.`, { page });
      }

      if (actionId === 'update_page') {
        return {
          ok: false,
          summary: 'Mutation action blocked pending approval.',
          errorMessage: 'update_page requires elevated approval.',
        };
      }

      return {
        ok: false,
        summary: 'Unsupported Notion connector action.',
        errorMessage: `Unknown action "${actionId}"`,
      };
    },
    async validateAuth(context) {
      const token = context.authToken?.trim() ?? '';
      if (token.length < 12 || !/^notion_[a-z0-9_-]+$/i.test(token)) {
        return {
          valid: false,
          message: 'Invalid Notion token format. Expected token prefix "notion_".',
        };
      }
      return {
        valid: true,
        message: 'Notion token accepted by connector health check.',
      };
    },
  };
};
