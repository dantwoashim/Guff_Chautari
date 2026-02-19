import { orgAuditLog, type OrgAuditLog } from './auditLog';
import { orgManager, type OrgManager } from './orgManager';
import type {
  ComplianceReport,
  DataAccessReportRow,
  GdprDataMapEntry,
  OrgAuditEntry,
  Organization,
  Soc2ChecklistItem,
} from './types';

interface ComplianceDependencies {
  orgManager?: Pick<OrgManager, 'getOrganization'>;
  auditLog?: Pick<OrgAuditLog, 'listEntriesAscending'>;
}

const clamp01 = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return Number(value.toFixed(4));
};

const buildSoc2Checklist = (payload: {
  organization: Organization;
  auditEntries: ReadonlyArray<DataAccessReportRow>;
}): Soc2ChecklistItem[] => {
  const hasAuditTrail = payload.auditEntries.length > 0;
  const hasAccessMonitoring = payload.auditEntries.some((entry) => /read|access/.test(entry.action.toLowerCase()));

  return [
    {
      id: 'access-controls',
      label: 'Access controls enforced',
      passed: payload.organization.policy.requireSso || payload.organization.workspaceIds.length > 0,
      evidence: payload.organization.policy.requireSso
        ? 'SSO required by organization policy.'
        : 'Workspace admin controls active.',
    },
    {
      id: 'audit-trail',
      label: 'Audit trail coverage',
      passed: hasAuditTrail,
      evidence: hasAuditTrail
        ? `${payload.auditEntries.length} audit event(s) recorded.`
        : 'No audit events were recorded yet.',
    },
    {
      id: 'encryption',
      label: 'Encryption and key controls',
      passed: payload.organization.policy.keyRotationDays <= 180,
      evidence: `Key rotation policy: every ${payload.organization.policy.keyRotationDays} day(s).`,
    },
    {
      id: 'monitoring',
      label: 'Data access monitoring',
      passed: hasAccessMonitoring,
      evidence: hasAccessMonitoring
        ? 'Read/access events present in audit stream.'
        : 'No access-monitoring events found in selected period.',
    },
  ];
};

const buildGdprDataMap = (payload: { organization: Organization }): GdprDataMapEntry[] => {
  const retention = payload.organization.policy.auditRetentionDays;

  return [
    {
      dataType: 'conversation_memory',
      location: `workspace:{id}:memory (${payload.organization.dataResidencyZone})`,
      retentionDays: retention,
      legalBasis: 'consent',
    },
    {
      dataType: 'knowledge_artifacts',
      location: `workspace:{id}:knowledge (${payload.organization.dataResidencyZone})`,
      retentionDays: retention,
      legalBasis: 'legitimate_interest',
    },
    {
      dataType: 'audit_events',
      location: `organization:${payload.organization.id}:audit`,
      retentionDays: retention,
      legalBasis: 'contract',
    },
  ];
};

const toAccessRows = (
  organizationId: string,
  entries: ReadonlyArray<OrgAuditEntry>
): DataAccessReportRow[] => {
  return entries
    .filter((entry) => entry.organizationId === organizationId)
    .map((entry) => ({
      actorUserId: entry.actorUserId,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      createdAtIso: entry.createdAtIso,
    }));
};

export const generateComplianceReport = (
  payload: {
    organizationId: string;
    nowIso?: string;
    days?: number;
  },
  dependencies: ComplianceDependencies = {}
): ComplianceReport => {
  const nowIso = payload.nowIso ?? new Date().toISOString();
  const orgManagerRef = dependencies.orgManager ?? orgManager;
  const auditLogRef = dependencies.auditLog ?? orgAuditLog;

  const organization = orgManagerRef.getOrganization(payload.organizationId);
  if (!organization) {
    throw new Error(`Organization ${payload.organizationId} not found.`);
  }

  const days = Math.max(1, Math.min(3650, Math.floor(payload.days ?? 30)));
  const fromMs = Date.parse(nowIso) - days * 24 * 60 * 60 * 1000;

  const rawEntries = auditLogRef.listEntriesAscending(payload.organizationId).filter((entry) => {
    const ts = Date.parse(entry.createdAtIso);
    return ts >= fromMs && ts <= Date.parse(nowIso);
  });

  const dataAccessReport = toAccessRows(payload.organizationId, rawEntries);
  const soc2Checklist = buildSoc2Checklist({
    organization,
    auditEntries: dataAccessReport,
  });

  const score =
    soc2Checklist.length === 0
      ? 0
      : clamp01(soc2Checklist.filter((item) => item.passed).length / soc2Checklist.length);

  return {
    organizationId: payload.organizationId,
    generatedAtIso: nowIso,
    soc2Readiness: {
      score,
      checklist: soc2Checklist,
    },
    gdprDataMap: buildGdprDataMap({ organization }),
    dataAccessReport,
  };
};
