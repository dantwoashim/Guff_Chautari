import { policyEngine, type ActorRole, type ApprovalRequest, type PolicyDecisionRecord } from '../../../src/policy';
import { runInSandbox } from './sandbox';
import type { PluginLoader } from './loader';
import type { PluginRuntimeContext, PluginToolResult } from './types';

const makeDecisionId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `policy-${crypto.randomUUID()}`;
  }
  return `policy-${Math.random().toString(16).slice(2, 10)}`;
};

export interface PluginToolInvocation {
  userId: string;
  actorRole?: ActorRole;
  pluginId: string;
  toolId: string;
  payload?: Record<string, unknown>;
}

export interface PluginToolInvocationOutcome {
  decision: PolicyDecisionRecord;
  approvalRequest?: ApprovalRequest;
  result?: PluginToolResult;
}

export class PluginToolRuntime {
  constructor(
    private readonly loader: PluginLoader,
    private readonly contextFactory: (pluginId: string, userId: string) => PluginRuntimeContext
  ) {}

  async invoke(input: PluginToolInvocation): Promise<PluginToolInvocationOutcome> {
    const loaded = this.loader.get(input.pluginId);
    if (!loaded) {
      throw new Error(`Plugin ${input.pluginId} is not installed.`);
    }

    const tool = loaded.plugin.toolDefinitions?.find((candidate) => candidate.id === input.toolId);
    if (!tool) {
      throw new Error(`Tool ${input.toolId} is not registered by plugin ${input.pluginId}.`);
    }

    if (!loaded.grantedPermissions.includes('tools.execute')) {
      const deniedDecision: PolicyDecisionRecord = {
        id: makeDecisionId(),
        actor_user_id: input.userId,
        action_id: `plugin.${input.pluginId}.${tool.id}`,
        resource_type: 'plugin_tool',
        decision: 'deny',
        risk_tier: 'red',
        reason: 'permission_denied:tools.execute',
        expires_at: null,
        created_at: new Date().toISOString(),
        metadata: {
          plugin_id: input.pluginId,
          tool_id: tool.id,
        },
      };
      return {
        decision: deniedDecision,
      };
    }

    const evaluation = policyEngine.evaluate({
      actor: {
        user_id: input.userId,
        role: input.actorRole ?? 'owner',
      },
      action: {
        action_id: `plugin.${input.pluginId}.${tool.id}`,
        resource_type: 'plugin_tool',
        mutation: tool.mutation,
        idempotent: tool.idempotent ?? !tool.mutation,
      },
    });

    if (evaluation.decision.decision !== 'allow') {
      return {
        decision: evaluation.decision,
        approvalRequest: evaluation.approval_request,
      };
    }

    const context = this.contextFactory(input.pluginId, input.userId);
    const result = await runInSandbox({
      operation: () => tool.execute(input.payload ?? {}, context),
      timeoutMs: 3_000,
    });

    return {
      decision: evaluation.decision,
      result,
    };
  }
}
