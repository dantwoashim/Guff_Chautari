import type { WorkspaceMemoryRecord } from './types';

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

export const workspaceMemoryNamespace = (payload: {
  workspaceId: string;
  userId?: string;
  visibility: 'personal' | 'shared';
}): string => {
  if (payload.visibility === 'shared') {
    return `workspace:${payload.workspaceId}:knowledge:shared`;
  }
  if (!payload.userId) {
    throw new Error('Personal memory namespace requires userId.');
  }
  return `workspace:${payload.workspaceId}:knowledge:personal:${payload.userId}`;
};

interface MemoryPartitionOptions {
  nowIso?: () => string;
}

export class WorkspaceMemoryPartition {
  private readonly nowIso: () => string;
  private readonly records = new Map<string, WorkspaceMemoryRecord>();
  private readonly workspaceIndex = new Map<string, string[]>();

  constructor(options: MemoryPartitionOptions = {}) {
    this.nowIso = options.nowIso ?? (() => new Date().toISOString());
  }

  createPersonalMemory(payload: {
    workspaceId: string;
    userId: string;
    title: string;
    content: string;
    tags?: string[];
    nowIso?: string;
  }): WorkspaceMemoryRecord {
    const nowIso = payload.nowIso ?? this.nowIso();
    const memory: WorkspaceMemoryRecord = {
      id: makeId('workspace-memory'),
      workspaceId: payload.workspaceId,
      ownerUserId: payload.userId,
      visibility: 'personal',
      namespace: workspaceMemoryNamespace({
        workspaceId: payload.workspaceId,
        userId: payload.userId,
        visibility: 'personal',
      }),
      title: payload.title.trim() || 'Untitled memory',
      content: payload.content.trim(),
      tags: payload.tags ? [...new Set(payload.tags)] : [],
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };
    this.persist(memory);
    return memory;
  }

  createSharedMemory(payload: {
    workspaceId: string;
    userId: string;
    title: string;
    content: string;
    tags?: string[];
    nowIso?: string;
  }): WorkspaceMemoryRecord {
    const nowIso = payload.nowIso ?? this.nowIso();
    const memory: WorkspaceMemoryRecord = {
      id: makeId('workspace-memory'),
      workspaceId: payload.workspaceId,
      ownerUserId: payload.userId,
      visibility: 'shared',
      namespace: workspaceMemoryNamespace({
        workspaceId: payload.workspaceId,
        visibility: 'shared',
      }),
      title: payload.title.trim() || 'Untitled memory',
      content: payload.content.trim(),
      tags: payload.tags ? [...new Set(payload.tags)] : [],
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };
    this.persist(memory);
    return memory;
  }

  listPersonalMemories(payload: { workspaceId: string; userId: string }): WorkspaceMemoryRecord[] {
    return this.listWorkspaceRecords(payload.workspaceId).filter(
      (record) => record.visibility === 'personal' && record.ownerUserId === payload.userId
    );
  }

  listSharedMemories(workspaceId: string): WorkspaceMemoryRecord[] {
    return this.listWorkspaceRecords(workspaceId).filter((record) => record.visibility === 'shared');
  }

  listVisibleMemories(payload: { workspaceId: string; userId: string }): WorkspaceMemoryRecord[] {
    return this.listWorkspaceRecords(payload.workspaceId).filter((record) => {
      if (record.visibility === 'shared') return true;
      return record.ownerUserId === payload.userId;
    });
  }

  promotePersonalMemory(payload: {
    workspaceId: string;
    memoryId: string;
    actorUserId: string;
    nowIso?: string;
  }): WorkspaceMemoryRecord {
    const source = this.records.get(payload.memoryId);
    if (!source || source.workspaceId !== payload.workspaceId) {
      throw new Error(`Memory ${payload.memoryId} not found in workspace.`);
    }
    if (source.visibility !== 'personal') {
      return source;
    }
    if (source.ownerUserId !== payload.actorUserId) {
      throw new Error('Only memory owner can promote personal memory to shared.');
    }

    const nowIso = payload.nowIso ?? this.nowIso();
    const shared: WorkspaceMemoryRecord = {
      ...source,
      id: makeId('workspace-memory'),
      visibility: 'shared',
      namespace: workspaceMemoryNamespace({
        workspaceId: source.workspaceId,
        visibility: 'shared',
      }),
      sourceMemoryId: source.id,
      promotedAtIso: nowIso,
      promotedByUserId: payload.actorUserId,
      updatedAtIso: nowIso,
    };
    this.persist(shared);
    return shared;
  }

  private persist(memory: WorkspaceMemoryRecord): void {
    this.records.set(memory.id, memory);
    const ids = this.workspaceIndex.get(memory.workspaceId) ?? [];
    this.workspaceIndex.set(memory.workspaceId, [memory.id, ...ids]);
  }

  private listWorkspaceRecords(workspaceId: string): WorkspaceMemoryRecord[] {
    const ids = this.workspaceIndex.get(workspaceId) ?? [];
    return ids
      .map((id) => this.records.get(id))
      .filter((record): record is WorkspaceMemoryRecord => Boolean(record))
      .sort((left, right) => Date.parse(right.updatedAtIso) - Date.parse(left.updatedAtIso));
  }
}

export const workspaceMemoryPartition = new WorkspaceMemoryPartition();

