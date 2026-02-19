import { describe, expect, it } from 'vitest';
import { ApiWebSocketServer } from '../websocket';

describe('api websocket server', () => {
  it('enforces per-user/workspace connection pool limits', () => {
    const server = new ApiWebSocketServer({
      maxConnectionsPerWorkspaceUser: 2,
    });

    const c1 = server.connect({
      userId: 'user-1',
      workspaceId: 'ws-1',
      nowIso: '2026-02-18T12:00:00.000Z',
    });
    const c2 = server.connect({
      userId: 'user-1',
      workspaceId: 'ws-1',
      nowIso: '2026-02-18T12:00:01.000Z',
    });
    const c3 = server.connect({
      userId: 'user-1',
      workspaceId: 'ws-1',
      nowIso: '2026-02-18T12:00:02.000Z',
    });

    const active = server.listConnections({
      userId: 'user-1',
      workspaceId: 'ws-1',
    });
    expect(active).toHaveLength(2);
    expect(active.some((connection) => connection.id === c1.id)).toBe(false);
    expect(active.some((connection) => connection.id === c2.id)).toBe(true);
    expect(active.some((connection) => connection.id === c3.id)).toBe(true);
  });

  it('caps retained events per connection while preserving latest entries', () => {
    const server = new ApiWebSocketServer({
      maxEventsPerConnection: 3,
    });
    const connection = server.connect({
      userId: 'user-2',
      workspaceId: 'ws-2',
    });

    for (let index = 0; index < 5; index += 1) {
      server.emit({
        requestId: `req-${index}`,
        workspaceId: 'ws-2',
        userId: 'user-2',
        connectionId: connection.id,
        type: 'pipeline.token',
        payload: { index },
      });
    }

    const events = server.readEvents(connection.id);
    expect(events).toHaveLength(3);
    expect(events[0].requestId).toBe('req-2');
    expect(events[2].requestId).toBe('req-4');
  });
});
