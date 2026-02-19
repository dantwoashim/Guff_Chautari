import { describe, expect, it } from 'vitest';
import {
  ConnectorRegistry,
  createCalendarConnector,
  createGDocsConnector,
  createImapConnector,
  createNotionConnector,
} from '../index';

describe('connectorRegistry', () => {
  it('invokes read-only connector actions and returns data', async () => {
    const registry = new ConnectorRegistry();
    registry.register(createImapConnector());

    const outcome = await registry.invoke({
      userId: 'user-1',
      connectorId: 'email',
      actionId: 'fetch_inbox',
      payload: { limit: 10 },
      actorRole: 'owner',
    });

    expect(outcome.policyDecision.decision).toBe('allow');
    expect(outcome.result?.ok).toBe(true);
    const messages = outcome.result?.data?.messages as Array<Record<string, unknown>>;
    expect(Array.isArray(messages)).toBe(true);
    expect(messages).toHaveLength(10);
    expect(messages[0]).toEqual(
      expect.objectContaining({
        subject: expect.any(String),
        body: expect.any(String),
        sender: expect.any(String),
      })
    );
  });

  it('invokes notion read actions and retrieves page content', async () => {
    const registry = new ConnectorRegistry();
    registry.register(createNotionConnector());

    const listOutcome = await registry.invoke({
      userId: 'user-3',
      connectorId: 'notion',
      actionId: 'list_pages',
      actorRole: 'owner',
    });
    expect(listOutcome.policyDecision.decision).toBe('allow');
    expect(listOutcome.result?.ok).toBe(true);

    const pages = listOutcome.result?.data?.pages as Array<{ id: string }>;
    expect(Array.isArray(pages)).toBe(true);
    expect(pages.length).toBeGreaterThan(0);

    const getOutcome = await registry.invoke({
      userId: 'user-3',
      connectorId: 'notion',
      actionId: 'get_page',
      payload: { pageId: pages[0].id },
      actorRole: 'owner',
    });

    expect(getOutcome.policyDecision.decision).toBe('allow');
    expect(getOutcome.result?.ok).toBe(true);
    expect(getOutcome.result?.data?.page).toEqual(
      expect.objectContaining({
        id: pages[0].id,
        content: expect.any(String),
      })
    );
  });

  it('invokes calendar and gdocs read actions', async () => {
    const registry = new ConnectorRegistry();
    registry.register(createCalendarConnector());
    registry.register(createGDocsConnector());

    const calendarOutcome = await registry.invoke({
      userId: 'user-4',
      connectorId: 'calendar',
      actionId: 'list_events',
      payload: { limit: 5 },
      actorRole: 'owner',
    });

    expect(calendarOutcome.policyDecision.decision).toBe('allow');
    expect(calendarOutcome.result?.ok).toBe(true);
    expect(Array.isArray(calendarOutcome.result?.data?.events)).toBe(true);

    const gdocsOutcome = await registry.invoke({
      userId: 'user-4',
      connectorId: 'gdocs',
      actionId: 'list_documents',
      actorRole: 'owner',
    });

    expect(gdocsOutcome.policyDecision.decision).toBe('allow');
    expect(gdocsOutcome.result?.ok).toBe(true);
    expect(Array.isArray(gdocsOutcome.result?.data?.documents)).toBe(true);
  });

  it('escalates high-risk mutation actions for approval', async () => {
    const registry = new ConnectorRegistry();
    registry.register(createNotionConnector());

    const outcome = await registry.invoke({
      userId: 'user-2',
      connectorId: 'notion',
      actionId: 'update_page',
      payload: { pageId: 'page-1', content: 'new content' },
      actorRole: 'owner',
    });

    expect(outcome.policyDecision.decision).toBe('escalate');
    expect(outcome.approvalRequest).toBeDefined();
    expect(outcome.result).toBeUndefined();
  });

  it('lists four registered connectors and validates health checks', async () => {
    const registry = new ConnectorRegistry();
    registry.register(createImapConnector());
    registry.register(createNotionConnector());
    registry.register(createCalendarConnector());
    registry.register(createGDocsConnector());

    expect(registry.list().map((connector) => connector.manifest.id).sort()).toEqual([
      'calendar',
      'email',
      'gdocs',
      'notion',
    ]);

    const health = await registry.checkAllConnectorHealth({
      userId: 'user-health',
      tokensByConnectorId: {
        email: 'imap_valid_token',
        notion: 'notion_valid_token',
        calendar: 'calendar_valid_token',
        gdocs: 'gdocs_valid_token',
      },
    });

    expect(health).toHaveLength(4);
    expect(health.every((status) => status.ok)).toBe(true);
  });

  it('blocks mock-backed connectors when mock mode is disabled', async () => {
    const registry = new ConnectorRegistry({ allowMockConnectors: false });
    registry.register(createImapConnector());

    const outcome = await registry.invoke({
      userId: 'user-5',
      connectorId: 'email',
      actionId: 'fetch_inbox',
      actorRole: 'owner',
    });

    expect(outcome.policyDecision.decision).toBe('allow');
    expect(outcome.result?.ok).toBe(false);
    expect(outcome.result?.errorMessage).toMatch(/mock-backed and disabled/i);

    const health = await registry.checkConnectorHealth({
      userId: 'user-5',
      connectorId: 'email',
      authToken: 'imap_valid_token',
    });
    expect(health.ok).toBe(false);
    expect(health.message).toMatch(/mock-backed and disabled/i);
  });
});
