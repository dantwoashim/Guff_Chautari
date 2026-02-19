import { policyEngine } from '../policy';
import type { ActorRole } from '../policy';
import type {
  Connector,
  ConnectorActionDefinition,
  ConnectorHealthCheckInput,
  ConnectorHealthStatus,
  ConnectorInvocationOutcome,
  ConnectorInvokeInput,
} from './types';
import { createImapConnector } from './email/imapConnector';
import { createNotionConnector } from './notion/notionConnector';
import { createCalendarConnector } from './calendar/calendarConnector';
import { createGDocsConnector } from './gdocs/gdocsConnector';

const actionResourceType = (connectorId: string): string => `connector:${connectorId}`;

const normalizePayload = (value: Record<string, unknown> | undefined): Record<string, unknown> => {
  return value ?? {};
};

interface ConnectorRegistryOptions {
  allowMockConnectors?: boolean;
}

const parseBooleanFlag = (value: string | undefined): boolean | null => {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return null;
};

const readImportMetaEnv = (key: string): string | undefined => {
  try {
    return (import.meta as { env?: Record<string, string | undefined> }).env?.[key];
  } catch {
    return undefined;
  }
};

const readProcessEnv = (key: string): string | undefined => {
  if (typeof process === 'undefined' || !process.env) return undefined;
  return process.env[key];
};

const resolveAllowMockConnectors = (): boolean => {
  const explicit =
    parseBooleanFlag(readImportMetaEnv('VITE_ENABLE_MOCK_CONNECTORS')) ??
    parseBooleanFlag(readProcessEnv('VITE_ENABLE_MOCK_CONNECTORS')) ??
    parseBooleanFlag(readProcessEnv('ENABLE_MOCK_CONNECTORS'));
  if (explicit !== null) return explicit;

  const isProdFromImportMeta = readImportMetaEnv('PROD') === 'true';
  const isProdFromProcess = readProcessEnv('NODE_ENV') === 'production';
  return !(isProdFromImportMeta || isProdFromProcess);
};

export class ConnectorRegistry {
  private readonly connectors = new Map<string, Connector>();
  private readonly allowMockConnectors: boolean;

  constructor(options: ConnectorRegistryOptions = {}) {
    this.allowMockConnectors = options.allowMockConnectors ?? resolveAllowMockConnectors();
  }

  private isMockConnectorDisabled(connector: Connector): boolean {
    return connector.manifest.runtimeMode === 'mock' && !this.allowMockConnectors;
  }

  private getMockDisabledMessage(connector: Connector): string {
    return `Connector "${connector.manifest.name}" is mock-backed and disabled. Set VITE_ENABLE_MOCK_CONNECTORS=true for local/test-only runs.`;
  }

  register(connector: Connector): void {
    this.connectors.set(connector.manifest.id, connector);
  }

  unregister(connectorId: string): void {
    this.connectors.delete(connectorId);
  }

  list(): Connector[] {
    return Array.from(this.connectors.values());
  }

  get(connectorId: string): Connector | null {
    return this.connectors.get(connectorId) ?? null;
  }

  private getActionDefinition(
    connector: Connector,
    actionId: string
  ): ConnectorActionDefinition | null {
    return connector.manifest.actions.find((action) => action.id === actionId) ?? null;
  }

  async invoke(input: ConnectorInvokeInput): Promise<ConnectorInvocationOutcome> {
    const connector = this.get(input.connectorId);
    if (!connector) {
      throw new Error(`Connector "${input.connectorId}" is not registered.`);
    }

    const action = this.getActionDefinition(connector, input.actionId);
    if (!action) {
      throw new Error(`Action "${input.actionId}" not found for connector "${input.connectorId}".`);
    }

    const actorRole: ActorRole = input.actorRole ?? 'owner';
    const evaluation = policyEngine.evaluate({
      actor: {
        user_id: input.userId,
        role: actorRole,
      },
      action: {
        action_id: action.policyActionId ?? `connector.${input.connectorId}.${action.id}`,
        resource_type: actionResourceType(input.connectorId),
        mutation: action.mutation,
        idempotent: action.idempotent ?? !action.mutation,
      },
    });

    if (evaluation.decision.decision !== 'allow') {
      return {
        connectorId: input.connectorId,
        actionId: input.actionId,
        policyDecision: evaluation.decision,
        approvalRequest: evaluation.approval_request,
      };
    }

    if (this.isMockConnectorDisabled(connector)) {
      return {
        connectorId: input.connectorId,
        actionId: input.actionId,
        policyDecision: evaluation.decision,
        result: {
          ok: false,
          summary: 'Connector invocation skipped.',
          errorMessage: this.getMockDisabledMessage(connector),
        },
      };
    }

    const result = await connector.execute(action.id, {
      userId: input.userId,
      payload: normalizePayload(input.payload),
    });

    return {
      connectorId: input.connectorId,
      actionId: input.actionId,
      policyDecision: evaluation.decision,
      result,
    };
  }

  async checkConnectorHealth(input: ConnectorHealthCheckInput): Promise<ConnectorHealthStatus> {
    const connector = this.get(input.connectorId);
    if (!connector) {
      throw new Error(`Connector "${input.connectorId}" is not registered.`);
    }

    const checkedAtIso = new Date().toISOString();
    if (this.isMockConnectorDisabled(connector)) {
      return {
        connectorId: connector.manifest.id,
        connectorName: connector.manifest.name,
        ok: false,
        authType: connector.manifest.auth.type,
        checkedAtIso,
        message: this.getMockDisabledMessage(connector),
      };
    }

    if (connector.validateAuth) {
      const validation = await connector.validateAuth({
        userId: input.userId,
        authToken: input.authToken,
      });
      return {
        connectorId: connector.manifest.id,
        connectorName: connector.manifest.name,
        ok: validation.valid,
        authType: connector.manifest.auth.type,
        checkedAtIso,
        message: validation.message,
      };
    }

    if (connector.manifest.auth.type === 'none') {
      return {
        connectorId: connector.manifest.id,
        connectorName: connector.manifest.name,
        ok: true,
        authType: connector.manifest.auth.type,
        checkedAtIso,
        message: 'No connector authentication required.',
      };
    }

    const token = input.authToken?.trim();
    return {
      connectorId: connector.manifest.id,
      connectorName: connector.manifest.name,
      ok: Boolean(token && token.length >= 12),
      authType: connector.manifest.auth.type,
      checkedAtIso,
      message:
        token && token.length >= 12
          ? 'Connector token shape accepted by fallback health check.'
          : 'Missing or invalid connector token for health check.',
    };
  }

  async checkAllConnectorHealth(payload: {
    userId: string;
    tokensByConnectorId?: Record<string, string>;
  }): Promise<ConnectorHealthStatus[]> {
    const tokens = payload.tokensByConnectorId ?? {};
    const results = await Promise.all(
      this.list().map((connector) =>
        this.checkConnectorHealth({
          userId: payload.userId,
          connectorId: connector.manifest.id,
          authToken: tokens[connector.manifest.id],
        })
      )
    );
    return results.sort((left, right) => left.connectorId.localeCompare(right.connectorId));
  }
}

export const connectorRegistry = new ConnectorRegistry({
  allowMockConnectors: resolveAllowMockConnectors(),
});
connectorRegistry.register(createImapConnector());
connectorRegistry.register(createNotionConnector());
connectorRegistry.register(createCalendarConnector());
connectorRegistry.register(createGDocsConnector());
