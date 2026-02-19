export type DataResidencyZone = 'US' | 'EU' | 'APAC';

export interface OrgPolicy {
  requireSso: boolean;
  allowCrossZoneFederation: boolean;
  auditRetentionDays: number;
  keyRotationDays: number;
  allowedEmailDomains: string[];
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended';
  createdByUserId: string;
  createdAtIso: string;
  updatedAtIso: string;
  workspaceIds: string[];
  dataResidencyZone: DataResidencyZone;
  policy: OrgPolicy;
}

export interface OrgAdmin {
  id: string;
  organizationId: string;
  userId: string;
  role: 'owner' | 'admin';
  createdAtIso: string;
}

export interface OrgAuditEntry {
  id: string;
  organizationId: string;
  actorUserId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  createdAtIso: string;
  metadata?: Record<string, string | number | boolean | null>;
  previousHash: string;
  hash: string;
}

export interface DataResidencyBinding {
  organizationId: string;
  workspaceId: string;
  zone: DataResidencyZone;
  updatedAtIso: string;
}

export interface Soc2ChecklistItem {
  id: string;
  label: string;
  passed: boolean;
  evidence: string;
}

export interface GdprDataMapEntry {
  dataType: string;
  location: string;
  retentionDays: number;
  legalBasis: 'consent' | 'contract' | 'legitimate_interest';
}

export interface DataAccessReportRow {
  actorUserId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  createdAtIso: string;
}

export interface ComplianceReport {
  organizationId: string;
  generatedAtIso: string;
  soc2Readiness: {
    score: number;
    checklist: Soc2ChecklistItem[];
  };
  gdprDataMap: GdprDataMapEntry[];
  dataAccessReport: DataAccessReportRow[];
}

export interface EnterpriseAnalyticsWorkspaceRow {
  workspaceId: string;
  activeUsersDaily: number;
  activeUsersWeekly: number;
  activeUsersMonthly: number;
  workflowRuns: number;
  workflowSuccessRate: number;
  apiCalls: number;
  knowledgeSources: number;
}

export interface EnterpriseAnalyticsReport {
  organizationId: string;
  generatedAtIso: string;
  rangeDays: number;
  workspaces: EnterpriseAnalyticsWorkspaceRow[];
  mostUsedConnectors: Array<{
    connectorId: string;
    uses: number;
  }>;
  totals: {
    activeUsersWeekly: number;
    workflowRuns: number;
    apiCalls: number;
    knowledgeGrowthRate: number;
  };
}
