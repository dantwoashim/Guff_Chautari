import { describe, expect, it } from 'vitest';
import { OrgAuditLog } from '../auditLog';
import { generateComplianceReport } from '../compliance';
import { OrgManager } from '../orgManager';

describe('compliance report', () => {
  it('generates report with SOC2, GDPR map, and data access sections populated', () => {
    const manager = new OrgManager();
    const audit = new OrgAuditLog();

    const created = manager.createOrganization({
      ownerUserId: 'owner-compliance',
      name: 'Compliance Org',
      workspaceIds: ['ws-compliance'],
      nowIso: '2026-09-05T09:00:00.000Z',
    });

    audit.append({
      organizationId: created.organization.id,
      actorUserId: 'owner-compliance',
      action: 'data.read',
      resourceType: 'memory',
      resourceId: 'mem-1',
      createdAtIso: '2026-09-05T10:00:00.000Z',
    });

    const report = generateComplianceReport(
      {
        organizationId: created.organization.id,
        nowIso: '2026-09-05T12:00:00.000Z',
      },
      {
        orgManager: manager,
        auditLog: audit,
      }
    );

    expect(report.soc2Readiness.checklist.length).toBeGreaterThan(0);
    expect(report.gdprDataMap.length).toBeGreaterThan(0);
    expect(report.dataAccessReport.length).toBeGreaterThan(0);
  });
});
