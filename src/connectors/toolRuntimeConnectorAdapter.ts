import { ConnectorRegistry } from './registry';
import type { ToolRuntime, ToolRuntimeDescriptor, ToolRuntimeInvocation, ToolRuntimeResult } from './types';

const parseConnectorToolId = (toolId: string): { connectorId: string; actionId: string } | null => {
  const dotIndex = toolId.indexOf('.');
  if (dotIndex <= 0 || dotIndex === toolId.length - 1) {
    return null;
  }
  return {
    connectorId: toolId.slice(0, dotIndex),
    actionId: toolId.slice(dotIndex + 1),
  };
};

export const createToolRuntimeConnectorAdapter = (
  registry: ConnectorRegistry
): ToolRuntime => {
  return {
    listTools(): ToolRuntimeDescriptor[] {
      return registry
        .list()
        .flatMap((connector) =>
          connector.manifest.actions.map((action) => ({
            id: `${connector.manifest.id}.${action.id}`,
            source: 'connector' as const,
            title: `${connector.manifest.name}: ${action.title}`,
            description: action.description,
            requiresMutation: action.mutation,
          }))
        );
    },

    async invoke(input: ToolRuntimeInvocation): Promise<ToolRuntimeResult> {
      const parsed = parseConnectorToolId(input.toolId);
      if (!parsed) {
        return {
          ok: false,
          toolId: input.toolId,
          source: 'connector',
          denied: true,
          summary: `Invalid connector tool id \"${input.toolId}\".`,
        };
      }

      const outcome = await registry.invoke({
        userId: input.userId,
        connectorId: parsed.connectorId,
        actionId: parsed.actionId,
        payload: input.payload,
        actorRole: input.actorRole,
      });

      if (outcome.policyDecision.decision !== 'allow') {
        return {
          ok: false,
          toolId: input.toolId,
          source: 'connector',
          denied: true,
          summary: `Policy ${outcome.policyDecision.decision}: ${outcome.policyDecision.reason}`,
          policyDecision: outcome.policyDecision,
        };
      }

      return {
        ok: outcome.result?.ok ?? false,
        toolId: input.toolId,
        source: 'connector',
        summary: outcome.result?.summary ?? 'Connector executed with no summary.',
        data: outcome.result?.data,
        policyDecision: outcome.policyDecision,
      };
    },
  };
};
