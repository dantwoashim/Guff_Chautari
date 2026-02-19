import { describe, expect, it } from 'vitest';
import { OrgAuditLog } from '../auditLog';

describe('org audit log', () => {
  it('keeps tamper-evident hash chain across 10 entries', () => {
    const log = new OrgAuditLog();

    for (let index = 0; index < 10; index += 1) {
      log.append({
        organizationId: 'org-audit',
        actorUserId: `user-${index % 2}`,
        action: `member.action.${index}`,
        resourceType: 'workspace_member',
        resourceId: `member-${index}`,
        createdAtIso: new Date(Date.parse('2026-09-04T09:00:00.000Z') + index * 60_000).toISOString(),
      });
    }

    const entries = log.listEntriesAscending('org-audit');
    expect(entries).toHaveLength(10);
    expect(log.validateChain('org-audit')).toBe(true);
  });
});
