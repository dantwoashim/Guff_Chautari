import { invokePluginTool, listPluginTools } from '../plugins';
import type { ToolRuntime, ToolRuntimeDescriptor, ToolRuntimeInvocation, ToolRuntimeResult } from './types';

const parsePluginToolId = (toolId: string): { pluginId: string; toolId: string } | null => {
  const dotIndex = toolId.indexOf('.');
  if (dotIndex <= 0 || dotIndex === toolId.length - 1) {
    return null;
  }
  return {
    pluginId: toolId.slice(0, dotIndex),
    toolId: toolId.slice(dotIndex + 1),
  };
};

export const createToolRuntimePluginAdapter = (): ToolRuntime => {
  return {
    listTools(): ToolRuntimeDescriptor[] {
      return listPluginTools().map((entry) => ({
        id: `${entry.pluginId}.${entry.tool.id}`,
        source: 'plugin',
        title: `${entry.pluginId}: ${entry.tool.title}`,
        description: entry.tool.description,
        requiresMutation: entry.tool.mutation,
      }));
    },

    async invoke(input: ToolRuntimeInvocation): Promise<ToolRuntimeResult> {
      const parsed = parsePluginToolId(input.toolId);
      if (!parsed) {
        return {
          ok: false,
          toolId: input.toolId,
          source: 'plugin',
          denied: true,
          summary: `Invalid plugin tool id \"${input.toolId}\".`,
        };
      }

      const outcome = await invokePluginTool({
        userId: input.userId,
        pluginId: parsed.pluginId,
        toolId: parsed.toolId,
        toolPayload: input.payload,
      });

      if (outcome.decision.decision !== 'allow') {
        return {
          ok: false,
          toolId: input.toolId,
          source: 'plugin',
          denied: true,
          summary: `Policy ${outcome.decision.decision}: ${outcome.decision.reason}`,
        };
      }

      return {
        ok: outcome.result?.ok ?? false,
        toolId: input.toolId,
        source: 'plugin',
        summary: outcome.result?.summary ?? 'Plugin executed with no summary.',
        data: outcome.result?.data,
      };
    },
  };
};
