import { BYOKKeyManager, type BYOKProvider } from '../byok';
import type { TeamKeyResolution } from './types';

interface ResolveMemberKeyInput {
  workspaceId: string;
  userId: string;
  provider: BYOKProvider;
}

interface TeamKeyRouterOptions {
  resolveMemberKey?: (input: ResolveMemberKeyInput) => Promise<string | null>;
}

const keyRecordId = (payload: ResolveMemberKeyInput): string =>
  `${payload.workspaceId}::${payload.userId}::${payload.provider}`;

const workspaceDefaultKeyRecordId = (payload: {
  workspaceId: string;
  provider: BYOKProvider;
}): string => `${payload.workspaceId}::workspace-default::${payload.provider}`;

export class TeamKeyRouter {
  private readonly inMemoryKeys = new Map<string, string>();
  private readonly workspaceDefaultKeys = new Map<string, string>();
  private readonly resolveMemberKey?: TeamKeyRouterOptions['resolveMemberKey'];

  constructor(options: TeamKeyRouterOptions = {}) {
    this.resolveMemberKey = options.resolveMemberKey;
  }

  setWorkspaceMemberKey(payload: ResolveMemberKeyInput & { apiKey: string }): void {
    this.inMemoryKeys.set(
      keyRecordId(payload),
      payload.apiKey.trim()
    );
  }

  removeWorkspaceMemberKey(payload: ResolveMemberKeyInput): void {
    this.inMemoryKeys.delete(keyRecordId(payload));
  }

  setWorkspaceDefaultKey(payload: {
    workspaceId: string;
    provider: BYOKProvider;
    apiKey: string;
  }): void {
    const normalized = payload.apiKey.trim();
    if (!normalized) {
      throw new Error('Workspace default API key is required.');
    }
    this.workspaceDefaultKeys.set(
      workspaceDefaultKeyRecordId({
        workspaceId: payload.workspaceId,
        provider: payload.provider,
      }),
      normalized
    );
  }

  removeWorkspaceDefaultKey(payload: {
    workspaceId: string;
    provider: BYOKProvider;
  }): void {
    this.workspaceDefaultKeys.delete(
      workspaceDefaultKeyRecordId({
        workspaceId: payload.workspaceId,
        provider: payload.provider,
      })
    );
  }

  hasWorkspaceDefaultKey(payload: {
    workspaceId: string;
    provider: BYOKProvider;
  }): boolean {
    const value = this.workspaceDefaultKeys.get(
      workspaceDefaultKeyRecordId({
        workspaceId: payload.workspaceId,
        provider: payload.provider,
      })
    );
    return Boolean(value && value.trim().length > 0);
  }

  async resolveChatKey(payload: ResolveMemberKeyInput): Promise<TeamKeyResolution> {
    const resolved = await this.resolveMemberOrFallback(payload);
    if (!resolved) {
      throw new Error(
        `No BYOK key available for workspace member ${payload.userId} (${payload.provider}).`
      );
    }
    return resolved;
  }

  async resolveWorkflowKey(payload: {
    workspaceId: string;
    workflowOwnerUserId: string;
    initiatorUserId: string;
    provider: BYOKProvider;
    useInitiatorKey?: boolean;
  }): Promise<TeamKeyResolution> {
    const primaryUserId = payload.useInitiatorKey
      ? payload.initiatorUserId
      : payload.workflowOwnerUserId;
    const secondaryUserId = payload.useInitiatorKey
      ? payload.workflowOwnerUserId
      : payload.initiatorUserId;

    const primary = await this.resolveMemberOrFallback({
      workspaceId: payload.workspaceId,
      userId: primaryUserId,
      provider: payload.provider,
    });
    if (primary) return primary;

    const secondary = await this.resolveMemberOrFallback({
      workspaceId: payload.workspaceId,
      userId: secondaryUserId,
      provider: payload.provider,
    });
    if (secondary) return secondary;

    throw new Error(
      `No workflow key available for owner=${payload.workflowOwnerUserId} initiator=${payload.initiatorUserId}.`
    );
  }

  private async resolveMemberOrFallback(
    payload: ResolveMemberKeyInput
  ): Promise<TeamKeyResolution | null> {
    const external = this.resolveMemberKey ? await this.resolveMemberKey(payload) : null;
    if (external && external.trim().length > 0) {
      return {
        workspaceId: payload.workspaceId,
        provider: payload.provider,
        key: external.trim(),
        resolvedForUserId: payload.userId,
        source: 'workspace_member',
      };
    }

    const local = this.inMemoryKeys.get(keyRecordId(payload)) ?? null;
    if (local && local.trim().length > 0) {
      return {
        workspaceId: payload.workspaceId,
        provider: payload.provider,
        key: local.trim(),
        resolvedForUserId: payload.userId,
        source: 'workspace_member',
      };
    }

    const workspaceDefault = this.workspaceDefaultKeys.get(
      workspaceDefaultKeyRecordId({
        workspaceId: payload.workspaceId,
        provider: payload.provider,
      })
    );
    if (workspaceDefault && workspaceDefault.trim().length > 0) {
      return {
        workspaceId: payload.workspaceId,
        provider: payload.provider,
        key: workspaceDefault.trim(),
        resolvedForUserId: payload.userId,
        source: 'workspace_default',
      };
    }

    const fallback = await BYOKKeyManager.getDecryptedKey(payload.provider);
    if (!fallback || fallback.trim().length === 0) {
      return null;
    }

    return {
      workspaceId: payload.workspaceId,
      provider: payload.provider,
      key: fallback.trim(),
      resolvedForUserId: payload.userId,
      source: 'byok_fallback',
    };
  }
}

export const teamKeyRouter = new TeamKeyRouter();
