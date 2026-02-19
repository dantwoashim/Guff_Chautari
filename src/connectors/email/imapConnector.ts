import type { Connector, ConnectorActionResult } from '../types';

interface MockEmailMessage {
  id: string;
  subject: string;
  sender: string;
  body: string;
  receivedAtIso: string;
}

const defaultMessages = (): MockEmailMessage[] =>
  Array.from({ length: 12 }, (_, index) => ({
    id: `mail-${index + 1}`,
    subject:
      index % 3 === 0
        ? `Daily Update ${index + 1}`
        : index % 3 === 1
          ? `Meeting Notes ${index + 1}`
          : `Action Required ${index + 1}`,
    sender: index % 2 === 0 ? 'team@example.com' : 'ops@example.com',
    body:
      index % 3 === 0
        ? 'Summary of overnight metrics and notable anomalies.'
        : index % 3 === 1
          ? 'Notes from stakeholder sync with key decisions and open questions.'
          : 'Please review the pending checklist items before end of day.',
    receivedAtIso: new Date(Date.now() - index * 60 * 60 * 1000).toISOString(),
  }));

const toResult = (summary: string, data: Record<string, unknown>): ConnectorActionResult => ({
  ok: true,
  summary,
  data,
});

export const createImapConnector = (
  seedMessages: ReadonlyArray<MockEmailMessage> = defaultMessages()
): Connector => {
  const messages = [...seedMessages];

  return {
    manifest: {
      id: 'email',
      name: 'IMAP Email (Read-only)',
      version: '1.0.0',
      runtimeMode: 'mock',
      auth: {
        type: 'api_key',
        setupLabel: 'Configure IMAP app password',
      },
      actions: [
        {
          id: 'fetch_inbox',
          title: 'Fetch inbox',
          description: 'Retrieve most recent inbox messages',
          mutation: false,
          idempotent: true,
        },
        {
          id: 'search_messages',
          title: 'Search messages',
          description: 'Search inbox by keyword',
          mutation: false,
          idempotent: true,
        },
        {
          id: 'get_message',
          title: 'Get message',
          description: 'Retrieve a single message by id',
          mutation: false,
          idempotent: true,
        },
        {
          id: 'send_email',
          title: 'Send email',
          description: 'Send outbound email',
          mutation: true,
          idempotent: false,
          policyActionId: 'connector.permission.grant',
        },
      ],
    },
    async execute(actionId, context) {
      if (actionId === 'fetch_inbox') {
        const limit = Number(context.payload.limit ?? 10);
        const inbox = messages.slice(0, Math.max(1, Math.min(limit, 25)));
        return toResult(`Fetched ${inbox.length} email(s).`, { messages: inbox });
      }

      if (actionId === 'search_messages') {
        const query = String(context.payload.query ?? '').trim().toLowerCase();
        const matches = query
          ? messages.filter(
              (message) =>
                message.subject.toLowerCase().includes(query) ||
                message.body.toLowerCase().includes(query) ||
                message.sender.toLowerCase().includes(query)
            )
          : messages;
        return toResult(`Found ${matches.length} matching email(s).`, { messages: matches.slice(0, 10) });
      }

      if (actionId === 'get_message') {
        const messageId = String(context.payload.messageId ?? '').trim();
        const message = messages.find((item) => item.id === messageId);
        if (!message) {
          return {
            ok: false,
            summary: 'Email not found.',
            errorMessage: `No message for id=${messageId}`,
          };
        }
        return toResult(`Loaded message ${message.id}.`, { message });
      }

      if (actionId === 'send_email') {
        return {
          ok: false,
          summary: 'Mutation action blocked pending approval.',
          errorMessage: 'send_email requires elevated approval.',
        };
      }

      return {
        ok: false,
        summary: 'Unsupported email connector action.',
        errorMessage: `Unknown action "${actionId}"`,
      };
    },
    async validateAuth(context) {
      const token = context.authToken?.trim() ?? '';
      if (token.length < 12 || !/^imap_[a-z0-9_-]+$/i.test(token)) {
        return {
          valid: false,
          message: 'Invalid IMAP app credential format. Expected token prefix "imap_".',
        };
      }
      return {
        valid: true,
        message: 'IMAP credential accepted by connector health check.',
      };
    },
  };
};
