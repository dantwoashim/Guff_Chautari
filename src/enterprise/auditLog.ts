import type { OrgAuditEntry } from './types';

interface AuditLogInput {
  organizationId: string;
  actorUserId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, string | number | boolean | null>;
  createdAtIso?: string;
}

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

const hashText = (input: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = (hash * 16777619) >>> 0;
  }
  return `h${hash.toString(16).padStart(8, '0')}`;
};

const buildHashPayload = (payload: {
  previousHash: string;
  organizationId: string;
  actorUserId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  createdAtIso: string;
  metadata?: Record<string, string | number | boolean | null>;
}): string => {
  return JSON.stringify({
    previousHash: payload.previousHash,
    organizationId: payload.organizationId,
    actorUserId: payload.actorUserId,
    action: payload.action,
    resourceType: payload.resourceType,
    resourceId: payload.resourceId,
    createdAtIso: payload.createdAtIso,
    metadata: payload.metadata ?? {},
  });
};

export class OrgAuditLog {
  private entriesByOrg = new Map<string, OrgAuditEntry[]>();

  append(input: AuditLogInput): OrgAuditEntry {
    const createdAtIso = input.createdAtIso ?? new Date().toISOString();
    const entries = this.entriesByOrg.get(input.organizationId) ?? [];
    const previousHash = entries[entries.length - 1]?.hash ?? 'GENESIS';

    const hash = hashText(
      buildHashPayload({
        previousHash,
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        createdAtIso,
        metadata: input.metadata,
      })
    );

    const entry: OrgAuditEntry = {
      id: makeId('org-audit'),
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      createdAtIso,
      metadata: input.metadata,
      previousHash,
      hash,
    };

    this.entriesByOrg.set(input.organizationId, [...entries, entry]);
    return entry;
  }

  listEntries(payload: { organizationId: string; limit?: number }): OrgAuditEntry[] {
    const limit = Math.max(1, payload.limit ?? 500);
    const entries = this.entriesByOrg.get(payload.organizationId) ?? [];
    return [...entries].slice(-limit).reverse();
  }

  listEntriesAscending(organizationId: string): OrgAuditEntry[] {
    return [...(this.entriesByOrg.get(organizationId) ?? [])];
  }

  validateChain(organizationId: string): boolean {
    const entries = this.entriesByOrg.get(organizationId) ?? [];
    let expectedPreviousHash = 'GENESIS';

    for (const entry of entries) {
      if (entry.previousHash !== expectedPreviousHash) {
        return false;
      }

      const expectedHash = hashText(
        buildHashPayload({
          previousHash: entry.previousHash,
          organizationId: entry.organizationId,
          actorUserId: entry.actorUserId,
          action: entry.action,
          resourceType: entry.resourceType,
          resourceId: entry.resourceId,
          createdAtIso: entry.createdAtIso,
          metadata: entry.metadata,
        })
      );

      if (expectedHash !== entry.hash) {
        return false;
      }

      expectedPreviousHash = entry.hash;
    }

    return true;
  }

  resetForTests(): void {
    this.entriesByOrg.clear();
  }
}

export const orgAuditLog = new OrgAuditLog();
