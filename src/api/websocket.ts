const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

export type PipelineWebSocketEventType =
  | 'pipeline.stage_complete'
  | 'pipeline.token'
  | 'pipeline.done'
  | 'pipeline.error';

export interface PipelineWebSocketEvent {
  id: string;
  requestId: string;
  workspaceId: string;
  userId: string;
  connectionId?: string;
  type: PipelineWebSocketEventType;
  payload: Record<string, unknown>;
  createdAtIso: string;
}

export interface ApiWebSocketConnection {
  id: string;
  userId: string;
  workspaceId: string;
  appId?: string;
  createdAtIso: string;
}

type ApiWebSocketSubscriber = (event: PipelineWebSocketEvent) => void;

interface ConnectionRuntime {
  connection: ApiWebSocketConnection;
  subscribers: Set<ApiWebSocketSubscriber>;
  events: PipelineWebSocketEvent[];
}

interface ApiWebSocketServerOptions {
  maxConnectionsPerWorkspaceUser?: number;
  maxEventsPerConnection?: number;
}

export class ApiWebSocketServer {
  private readonly connections = new Map<string, ConnectionRuntime>();
  private readonly maxConnectionsPerWorkspaceUser: number;
  private readonly maxEventsPerConnection: number;

  constructor(options: ApiWebSocketServerOptions = {}) {
    this.maxConnectionsPerWorkspaceUser = Math.max(
      1,
      options.maxConnectionsPerWorkspaceUser ?? 8
    );
    this.maxEventsPerConnection = Math.max(1, options.maxEventsPerConnection ?? 200);
  }

  connect(input: {
    userId: string;
    workspaceId: string;
    appId?: string;
    nowIso?: string;
  }): ApiWebSocketConnection {
    const connection: ApiWebSocketConnection = {
      id: makeId('ws-conn'),
      userId: input.userId,
      workspaceId: input.workspaceId,
      appId: input.appId,
      createdAtIso: input.nowIso ?? new Date().toISOString(),
    };

    this.enforceConnectionPool({
      userId: connection.userId,
      workspaceId: connection.workspaceId,
    });

    this.connections.set(connection.id, {
      connection,
      subscribers: new Set<ApiWebSocketSubscriber>(),
      events: [],
    });

    return { ...connection };
  }

  disconnect(connectionId: string): void {
    this.connections.delete(connectionId);
  }

  subscribe(connectionId: string, subscriber: ApiWebSocketSubscriber): () => void {
    const runtime = this.connections.get(connectionId);
    if (!runtime) {
      throw new Error(`WebSocket connection ${connectionId} not found.`);
    }

    runtime.subscribers.add(subscriber);
    return () => {
      const next = this.connections.get(connectionId);
      next?.subscribers.delete(subscriber);
    };
  }

  emit(input: {
    requestId: string;
    workspaceId: string;
    userId: string;
    type: PipelineWebSocketEventType;
    payload: Record<string, unknown>;
    connectionId?: string;
    nowIso?: string;
  }): PipelineWebSocketEvent {
    const event: PipelineWebSocketEvent = {
      id: makeId('ws-event'),
      requestId: input.requestId,
      workspaceId: input.workspaceId,
      userId: input.userId,
      connectionId: input.connectionId,
      type: input.type,
      payload: { ...input.payload },
      createdAtIso: input.nowIso ?? new Date().toISOString(),
    };

    const targets = this.resolveTargets(input);
    for (const runtime of targets) {
      runtime.events.push(event);
      if (runtime.events.length > this.maxEventsPerConnection) {
        runtime.events.splice(0, runtime.events.length - this.maxEventsPerConnection);
      }
      for (const subscriber of runtime.subscribers) {
        subscriber({ ...event, payload: { ...event.payload } });
      }
    }

    return event;
  }

  readEvents(connectionId: string): PipelineWebSocketEvent[] {
    const runtime = this.connections.get(connectionId);
    if (!runtime) return [];
    return runtime.events.map((event) => ({
      ...event,
      payload: { ...event.payload },
    }));
  }

  listConnections(input?: {
    userId?: string;
    workspaceId?: string;
  }): ApiWebSocketConnection[] {
    return Array.from(this.connections.values())
      .map((runtime) => runtime.connection)
      .filter((connection) => {
        if (input?.userId && connection.userId !== input.userId) return false;
        if (input?.workspaceId && connection.workspaceId !== input.workspaceId) return false;
        return true;
      })
      .map((connection) => ({ ...connection }));
  }

  resetForTests(): void {
    this.connections.clear();
  }

  private resolveTargets(input: {
    userId: string;
    workspaceId: string;
    connectionId?: string;
  }): ConnectionRuntime[] {
    if (input.connectionId) {
      const runtime = this.connections.get(input.connectionId);
      return runtime ? [runtime] : [];
    }

    return Array.from(this.connections.values()).filter((runtime) => {
      return (
        runtime.connection.userId === input.userId &&
        runtime.connection.workspaceId === input.workspaceId
      );
    });
  }

  private enforceConnectionPool(payload: {
    userId: string;
    workspaceId: string;
  }): void {
    const matching = Array.from(this.connections.values())
      .filter((runtime) => {
        return (
          runtime.connection.userId === payload.userId &&
          runtime.connection.workspaceId === payload.workspaceId
        );
      })
      .sort((left, right) =>
        Date.parse(left.connection.createdAtIso) - Date.parse(right.connection.createdAtIso)
      );

    const overflow = matching.length - this.maxConnectionsPerWorkspaceUser + 1;
    if (overflow <= 0) return;
    for (const runtime of matching.slice(0, overflow)) {
      this.connections.delete(runtime.connection.id);
    }
  }
}

export const apiWebSocketServer = new ApiWebSocketServer();
