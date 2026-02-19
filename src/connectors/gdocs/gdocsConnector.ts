import type { Connector, ConnectorActionResult } from '../types';

interface MockDocument {
  id: string;
  title: string;
  content: string;
  updatedAtIso: string;
}

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

const defaultDocuments = (): MockDocument[] => {
  const now = Date.now();

  return [
    {
      id: 'doc-1',
      title: 'Weekly Briefing Draft',
      content: 'Key outcomes:\n- Revenue up 8%\n- Support response down to 4h',
      updatedAtIso: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'doc-2',
      title: 'Product Retrospective',
      content: 'What worked:\n1. Faster approvals\n2. Better scope discipline',
      updatedAtIso: new Date(now - 26 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'doc-3',
      title: 'Research Notes',
      content: 'Interview synthesis and recurring user pain points.',
      updatedAtIso: new Date(now - 50 * 60 * 60 * 1000).toISOString(),
    },
  ];
};

const toResult = (summary: string, data: Record<string, unknown>): ConnectorActionResult => ({
  ok: true,
  summary,
  data,
});

export const createGDocsConnector = (
  seedDocuments: ReadonlyArray<MockDocument> = defaultDocuments()
): Connector => {
  const documents = [...seedDocuments];

  return {
    manifest: {
      id: 'gdocs',
      name: 'Google Docs',
      version: '1.0.0',
      runtimeMode: 'mock',
      auth: {
        type: 'oauth',
        setupLabel: 'Connect Google Workspace',
      },
      actions: [
        {
          id: 'list_documents',
          title: 'List documents',
          description: 'List available documents.',
          mutation: false,
          idempotent: true,
        },
        {
          id: 'read_document',
          title: 'Read document',
          description: 'Load full document content by id.',
          mutation: false,
          idempotent: true,
        },
        {
          id: 'append_to_document',
          title: 'Append to document',
          description: 'Append text to an existing document.',
          mutation: true,
          idempotent: false,
          policyActionId: 'connector.permission.grant',
        },
        {
          id: 'create_document',
          title: 'Create document',
          description: 'Create a new document with initial content.',
          mutation: true,
          idempotent: false,
          policyActionId: 'connector.permission.grant',
        },
      ],
    },
    async execute(actionId, context) {
      if (actionId === 'list_documents') {
        const limit = Number(context.payload.limit ?? 20);
        return toResult(`Loaded ${documents.length} document(s).`, {
          documents: documents.slice(0, Math.max(1, Math.min(limit, 100))),
        });
      }

      if (actionId === 'read_document') {
        const documentId = String(context.payload.documentId ?? '').trim();
        const document = documents.find((item) => item.id === documentId);

        if (!document) {
          return {
            ok: false,
            summary: 'Document not found.',
            errorMessage: `No document for id=${documentId}`,
          };
        }

        return toResult(`Loaded document ${document.id}.`, { document });
      }

      if (actionId === 'append_to_document') {
        const documentId = String(context.payload.documentId ?? '').trim();
        const appendText = String(context.payload.appendText ?? '').trim();

        if (!documentId || !appendText) {
          return {
            ok: false,
            summary: 'Cannot append to document.',
            errorMessage: 'documentId and appendText are required.',
          };
        }

        const index = documents.findIndex((item) => item.id === documentId);
        if (index === -1) {
          return {
            ok: false,
            summary: 'Document not found.',
            errorMessage: `No document for id=${documentId}`,
          };
        }

        const updated: MockDocument = {
          ...documents[index],
          content: `${documents[index].content}\n${appendText}`,
          updatedAtIso: new Date().toISOString(),
        };

        documents[index] = updated;
        return toResult(`Appended content to ${updated.id}.`, { document: updated });
      }

      if (actionId === 'create_document') {
        const title = String(context.payload.title ?? '').trim();
        const content = String(context.payload.content ?? '').trim();

        if (!title) {
          return {
            ok: false,
            summary: 'Cannot create document.',
            errorMessage: 'title is required.',
          };
        }

        const created: MockDocument = {
          id: makeId('doc'),
          title,
          content,
          updatedAtIso: new Date().toISOString(),
        };

        documents.unshift(created);
        return toResult(`Created document ${created.id}.`, { document: created });
      }

      return {
        ok: false,
        summary: 'Unsupported gdocs connector action.',
        errorMessage: `Unknown action "${actionId}"`,
      };
    },
    async validateAuth(context) {
      const token = context.authToken?.trim() ?? '';
      if (token.length < 12 || !/^gdocs_[a-z0-9_-]+$/i.test(token)) {
        return {
          valid: false,
          message: 'Invalid Google Docs token format. Expected token prefix "gdocs_".',
        };
      }
      return {
        valid: true,
        message: 'Google Docs token accepted by connector health check.',
      };
    },
  };
};
