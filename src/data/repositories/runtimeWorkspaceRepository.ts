import { defaultSupabaseClient, SupabaseLike } from './base';

const toRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
};

const toNumber = (value: unknown, fallback: number): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

export interface RuntimeWorkspaceSnapshot {
  id: string;
  userId: string;
  workspaceId: string;
  payload: Record<string, unknown>;
  schemaVersion: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface RuntimeWorkspaceMemberSnapshot {
  id: string;
  userId: string;
  workspaceId: string;
  memberUserId: string;
  role: string;
  payload: Record<string, unknown>;
  schemaVersion: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface RuntimeWorkspaceInviteSnapshot {
  id: string;
  userId: string;
  workspaceId: string;
  inviteId: string;
  status: string;
  payload: Record<string, unknown>;
  schemaVersion: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

const toWorkspaceSnapshot = (row: unknown): RuntimeWorkspaceSnapshot => {
  const source = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
  return {
    id: String(source.id ?? ''),
    userId: String(source.user_id ?? ''),
    workspaceId: String(source.workspace_id ?? ''),
    payload: toRecord(source.payload),
    schemaVersion: toNumber(source.schema_version, 1),
    version: toNumber(source.version, 1),
    createdAt: String(source.created_at ?? ''),
    updatedAt: String(source.updated_at ?? ''),
  };
};

const toMemberSnapshot = (row: unknown): RuntimeWorkspaceMemberSnapshot => {
  const source = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
  return {
    id: String(source.id ?? ''),
    userId: String(source.user_id ?? ''),
    workspaceId: String(source.workspace_id ?? ''),
    memberUserId: String(source.member_user_id ?? ''),
    role: String(source.role ?? 'viewer'),
    payload: toRecord(source.payload),
    schemaVersion: toNumber(source.schema_version, 1),
    version: toNumber(source.version, 1),
    createdAt: String(source.created_at ?? ''),
    updatedAt: String(source.updated_at ?? ''),
  };
};

const toInviteSnapshot = (row: unknown): RuntimeWorkspaceInviteSnapshot => {
  const source = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
  return {
    id: String(source.id ?? ''),
    userId: String(source.user_id ?? ''),
    workspaceId: String(source.workspace_id ?? ''),
    inviteId: String(source.invite_id ?? ''),
    status: String(source.status ?? 'pending'),
    payload: toRecord(source.payload),
    schemaVersion: toNumber(source.schema_version, 1),
    version: toNumber(source.version, 1),
    createdAt: String(source.created_at ?? ''),
    updatedAt: String(source.updated_at ?? ''),
  };
};

export class RuntimeWorkspaceRepository {
  constructor(private readonly client: SupabaseLike = defaultSupabaseClient) {}

  async upsertWorkspace(payload: {
    userId: string;
    workspaceId: string;
    state: Record<string, unknown>;
    schemaVersion?: number;
    version?: number;
  }): Promise<void> {
    const nowIso = new Date().toISOString();
    const { error } = await this.client.from('runtime_workspaces').upsert({
      user_id: payload.userId,
      workspace_id: payload.workspaceId,
      payload: payload.state,
      schema_version: payload.schemaVersion ?? 1,
      version: payload.version ?? 1,
      updated_at: nowIso,
    });
    if (error) throw error;
  }

  async getWorkspace(
    userId: string,
    workspaceId: string
  ): Promise<RuntimeWorkspaceSnapshot | null> {
    const { data, error } = await this.client
      .from('runtime_workspaces')
      .select('*')
      .eq('user_id', userId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return toWorkspaceSnapshot(data);
  }

  async listWorkspaces(userId: string): Promise<RuntimeWorkspaceSnapshot[]> {
    const { data, error } = await this.client
      .from('runtime_workspaces')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (Array.isArray(data) ? data : []).map(toWorkspaceSnapshot);
  }

  async upsertMember(payload: {
    userId: string;
    workspaceId: string;
    memberUserId: string;
    role: string;
    state?: Record<string, unknown>;
    schemaVersion?: number;
    version?: number;
  }): Promise<void> {
    const nowIso = new Date().toISOString();
    const { error } = await this.client.from('runtime_workspace_members').upsert({
      user_id: payload.userId,
      workspace_id: payload.workspaceId,
      member_user_id: payload.memberUserId,
      role: payload.role,
      payload: payload.state ?? {},
      schema_version: payload.schemaVersion ?? 1,
      version: payload.version ?? 1,
      updated_at: nowIso,
    });
    if (error) throw error;
  }

  async listMembers(
    userId: string,
    workspaceId: string
  ): Promise<RuntimeWorkspaceMemberSnapshot[]> {
    const { data, error } = await this.client
      .from('runtime_workspace_members')
      .select('*')
      .eq('user_id', userId)
      .eq('workspace_id', workspaceId)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (Array.isArray(data) ? data : []).map(toMemberSnapshot);
  }

  async upsertInvite(payload: {
    userId: string;
    workspaceId: string;
    inviteId: string;
    status: string;
    state?: Record<string, unknown>;
    schemaVersion?: number;
    version?: number;
  }): Promise<void> {
    const nowIso = new Date().toISOString();
    const { error } = await this.client.from('runtime_workspace_invites').upsert({
      user_id: payload.userId,
      workspace_id: payload.workspaceId,
      invite_id: payload.inviteId,
      status: payload.status,
      payload: payload.state ?? {},
      schema_version: payload.schemaVersion ?? 1,
      version: payload.version ?? 1,
      updated_at: nowIso,
    });
    if (error) throw error;
  }

  async listInvites(
    userId: string,
    workspaceId: string
  ): Promise<RuntimeWorkspaceInviteSnapshot[]> {
    const { data, error } = await this.client
      .from('runtime_workspace_invites')
      .select('*')
      .eq('user_id', userId)
      .eq('workspace_id', workspaceId)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (Array.isArray(data) ? data : []).map(toInviteSnapshot);
  }
}

export const runtimeWorkspaceRepository = new RuntimeWorkspaceRepository();
