import React, { useState } from 'react';
import { generateComplianceReport, orgAuditLog, orgManager, ssoManager } from '../../enterprise';

interface OrgAdminDashboardPanelProps {
  userId: string;
}

const panelClass = 'rounded-xl border border-[#313d45] bg-[#111b21] p-4 text-sm text-[#c7d0d6]';

export const OrgAdminDashboardPanel: React.FC<OrgAdminDashboardPanelProps> = ({ userId }) => {
  const [refreshTick, setRefreshTick] = useState(0);
  const [status, setStatus] = useState('');

  const refresh = () => setRefreshTick((tick) => tick + 1);

  const organizations = orgManager.listOrganizationsForUser(userId);

  const organization = organizations[0] ?? null;

  const compliance = (() => {
    if (!organization) return null;
    try {
      return generateComplianceReport({
        organizationId: organization.id,
      });
    } catch {
      return null;
    }
  })();

  const auditRows = organization
    ? orgAuditLog.listEntries({
        organizationId: organization.id,
        limit: 20,
      })
    : [];

  const ssoProviders = (() => {
    if (!organization) return [];
    try {
      return ssoManager.listProviders({
        organizationId: organization.id,
      });
    } catch {
      return [];
    }
  })();

  const bootstrapOrg = () => {
    const created = orgManager.createOrganization({
      ownerUserId: userId,
      name: 'Enterprise Workspace Org',
      nowIso: new Date().toISOString(),
    });

    orgAuditLog.append({
      organizationId: created.organization.id,
      actorUserId: userId,
      action: 'organization.created',
      resourceType: 'organization',
      resourceId: created.organization.id,
    });

    setStatus(`Created organization ${created.organization.name}.`);
    refresh();
  };

  const configureSampleSso = () => {
    if (!organization) return;

    ssoManager.configureProvider({
      organizationId: organization.id,
      actorUserId: userId,
      type: 'oidc',
      name: 'Sample OIDC',
      oidc: {
        issuer: 'https://idp.example',
        clientId: 'ashim-enterprise-client',
        audience: 'ashim-enterprise',
      },
    });

    orgAuditLog.append({
      organizationId: organization.id,
      actorUserId: userId,
      action: 'sso.provider_configured',
      resourceType: 'sso_provider',
      resourceId: 'sample-oidc',
    });

    setStatus('Configured sample OIDC provider.');
    refresh();
  };

  return (
    <div className="h-full overflow-y-auto bg-[#0b141a] p-4">
      <div className="mx-auto max-w-7xl space-y-4">
        <header className={panelClass}>
          <h2 className="text-lg font-semibold text-[#e9edef]">Org Admin Dashboard</h2>
          <p className="mt-1 text-sm text-[#8ea1ab]">
            Organization overview with audit log, compliance readiness, and SSO posture.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded border border-[#4f6f84] px-3 py-2 text-xs text-[#bfd8e8] hover:bg-[#1d3140]"
              onClick={bootstrapOrg}
            >
              Create Org
            </button>
            <button
              type="button"
              className="rounded border border-[#4f6f84] px-3 py-2 text-xs text-[#bfd8e8] hover:bg-[#1d3140]"
              onClick={refresh}
            >
              Refresh
            </button>
            {organization ? (
              <button
                type="button"
                className="rounded border border-[#4f6f84] px-3 py-2 text-xs text-[#bfd8e8] hover:bg-[#1d3140]"
                onClick={configureSampleSso}
              >
                Configure Sample SSO
              </button>
            ) : null}
          </div>
        </header>

        {organization ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <article className={panelClass}>
                <div className="text-xs text-[#8ea1ab]">Organization</div>
                <div className="mt-1 text-sm text-[#e9edef]">{organization.name}</div>
              </article>
              <article className={panelClass}>
                <div className="text-xs text-[#8ea1ab]">Workspaces</div>
                <div className="mt-1 text-xl text-[#e9edef]">{organization.workspaceIds.length}</div>
              </article>
              <article className={panelClass}>
                <div className="text-xs text-[#8ea1ab]">Audit entries</div>
                <div className="mt-1 text-xl text-[#e9edef]">{auditRows.length}</div>
              </article>
              <article className={panelClass}>
                <div className="text-xs text-[#8ea1ab]">SSO providers</div>
                <div className="mt-1 text-xl text-[#e9edef]">{ssoProviders.length}</div>
              </article>
            </section>

            <div className="grid gap-4 lg:grid-cols-2">
              <section className={panelClass}>
                <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Compliance Status</h3>
                {compliance ? (
                  <>
                    <div className="mb-2 text-xs text-[#8ea1ab]">
                      SOC2 readiness: {Math.round(compliance.soc2Readiness.score * 100)}%
                    </div>
                    <div className="space-y-2 text-xs">
                      {compliance.soc2Readiness.checklist.map((item) => (
                        <div key={item.id} className="rounded border border-[#2d3942] bg-[#0d151a] p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[#e9edef]">{item.label}</span>
                            <span className={item.passed ? 'text-[#9de5ba]' : 'text-[#f2c0c0]'}>
                              {item.passed ? 'pass' : 'warn'}
                            </span>
                          </div>
                          <div className="mt-1 text-[#8ea1ab]">{item.evidence}</div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="rounded border border-[#2d3942] bg-[#0d151a] p-3 text-xs text-[#8ea1ab]">
                    Compliance report unavailable.
                  </div>
                )}
              </section>

              <section className={panelClass}>
                <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Recent Audit Log</h3>
                {auditRows.length === 0 ? (
                  <div className="rounded border border-[#2d3942] bg-[#0d151a] p-3 text-xs text-[#8ea1ab]">
                    No audit entries yet.
                  </div>
                ) : (
                  <div className="space-y-2 text-xs">
                    {auditRows.slice(0, 10).map((entry) => (
                      <div key={entry.id} className="rounded border border-[#2d3942] bg-[#0d151a] p-3">
                        <div className="text-[#e9edef]">{entry.action}</div>
                        <div className="mt-1 text-[#8ea1ab]">
                          {entry.resourceType}:{entry.resourceId} • actor {entry.actorUserId}
                        </div>
                        <div className="mt-1 text-[#70868f]">{new Date(entry.createdAtIso).toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <section className={panelClass}>
              <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">SSO Configuration</h3>
              {ssoProviders.length === 0 ? (
                <div className="rounded border border-[#2d3942] bg-[#0d151a] p-3 text-xs text-[#8ea1ab]">
                  No providers configured.
                </div>
              ) : (
                <div className="space-y-2 text-xs">
                  {ssoProviders.map((provider) => (
                    <div key={provider.id} className="rounded border border-[#2d3942] bg-[#0d151a] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[#e9edef]">{provider.name}</span>
                        <span className="text-[#8ea1ab]">{provider.type}</span>
                      </div>
                      <div className="mt-1 text-[#8ea1ab]">Enabled: {provider.enabled ? 'yes' : 'no'}</div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : (
          <section className={panelClass}>
            <div className="text-xs text-[#8ea1ab]">
              No organization yet for this user. Create one to initialize enterprise admin workflows.
            </div>
          </section>
        )}

        {status ? (
          <div className="rounded border border-[#2d3942] bg-[#0d151a] px-3 py-2 text-xs text-[#aebec8]">{status}</div>
        ) : null}
      </div>
    </div>
  );
};

export default OrgAdminDashboardPanel;
