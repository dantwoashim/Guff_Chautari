import React, { useMemo, useState } from 'react';
import {
  getTemplateCommunityStats,
  listTemplateSubmissions,
  type TemplateSubmission,
} from '../../marketplace';
import {
  evaluateReleaseGate,
  evaluateSelfHostReadiness,
  week80DefaultReleaseChecks,
  type ReleaseCheckStatus,
  type ServiceHealthStatus,
} from '../../operations';

interface PlatformOpsPanelProps {
  userId: string;
}

const panelClass = 'rounded-xl border border-[#313d45] bg-[#111b21] p-4 text-sm text-[#c7d0d6]';

const formatPct = (value: number): string => `${Math.round(value * 100)}%`;

const statusPill = (status: 'ok' | 'warn' | 'fail'): string => {
  if (status === 'ok') return 'border-[#2f6f52] bg-[#123526] text-[#b7ebcb]';
  if (status === 'warn') return 'border-[#705d2b] bg-[#31280f] text-[#eedda3]';
  return 'border-[#7b3b3b] bg-[#311414] text-[#f2c0c0]';
};

const sortBySubmittedAt = (entries: TemplateSubmission[]): TemplateSubmission[] => {
  return [...entries].sort((left, right) => Date.parse(right.submittedAtIso) - Date.parse(left.submittedAtIso));
};

export const PlatformOpsPanel: React.FC<PlatformOpsPanelProps> = ({ userId }) => {
  const [serviceStatuses, setServiceStatuses] = useState<Record<string, ServiceHealthStatus>>({
    app: 'healthy',
    'supabase-db': 'healthy',
    monitoring: 'degraded',
  });
  const [releaseStatuses, setReleaseStatuses] = useState<Record<string, ReleaseCheckStatus>>(() => {
    return Object.fromEntries(week80DefaultReleaseChecks().map((check) => [check.id, check.status]));
  });

  const approvedSubmissions = useMemo(() => {
    return sortBySubmittedAt(listTemplateSubmissions({ userId, status: 'approved' })).slice(0, 10);
  }, [userId]);

  const certificationRows = useMemo(() => {
    return approvedSubmissions.map((submission) => {
      const stats = getTemplateCommunityStats({
        userId,
        templateId: submission.template.metadata.id,
      });

      return {
        id: submission.id,
        templateId: submission.template.metadata.id,
        name: submission.template.metadata.name,
        creator: submission.submitterProfile.displayName,
        ashimCertified: stats?.ashimCertified ?? false,
        level: stats?.certificationLevel ?? 'none',
        score: stats?.certificationScore ?? 0,
        updatedAtIso: stats?.certificationUpdatedAtIso,
      };
    });
  }, [approvedSubmissions, userId]);

  const selfHostReport = useMemo(() => {
    return evaluateSelfHostReadiness({
      nowIso: '2026-10-20T09:00:00.000Z',
      services: [
        {
          service: 'app',
          required: true,
          status: serviceStatuses.app,
          message: 'Nginx runtime health endpoint',
        },
        {
          service: 'supabase-db',
          required: true,
          status: serviceStatuses['supabase-db'],
          message: 'Local persistence backend',
        },
        {
          service: 'monitoring',
          required: false,
          status: serviceStatuses.monitoring,
          message: 'Prometheus + Grafana profile',
        },
      ],
    });
  }, [serviceStatuses]);

  const releaseReport = useMemo(() => {
    const checks = week80DefaultReleaseChecks().map((check) => ({
      ...check,
      status: releaseStatuses[check.id] ?? check.status,
    }));

    return evaluateReleaseGate({
      nowIso: '2026-10-20T09:00:00.000Z',
      checks,
      minimumScore: 0.85,
    });
  }, [releaseStatuses]);

  return (
    <div className="h-full overflow-y-auto bg-[#0b141a] p-4">
      <div className="mx-auto max-w-6xl space-y-4">
        <section className={panelClass}>
          <h2 className="text-lg font-semibold text-[#e9edef]">Platform Ops</h2>
          <p className="mt-1 text-sm text-[#9fb0b8]">
            Week 81-83 control plane: certification health, self-host readiness, and release gate posture.
          </p>
        </section>

        <section className={panelClass}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-[#e9edef]">Certification Queue</h3>
            <span
              className={`rounded border px-2 py-1 text-xs ${statusPill(
                certificationRows.some((row) => !row.ashimCertified) ? 'warn' : 'ok'
              )}`}
            >
              {certificationRows.filter((row) => row.ashimCertified).length}/{certificationRows.length} certified
            </span>
          </div>

          {certificationRows.length === 0 ? (
            <div className="rounded border border-[#27343d] bg-[#0f171c] p-3 text-xs text-[#8ea1ab]">
              No approved submissions yet.
            </div>
          ) : (
            <div className="space-y-2">
              {certificationRows.map((row) => (
                <div
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded border border-[#27343d] bg-[#0f171c] p-3 text-xs"
                >
                  <div>
                    <div className="text-sm text-[#e9edef]">{row.name}</div>
                    <div className="text-[#8ea1ab]">
                      {row.templateId} • creator {row.creator}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded border px-2 py-1 ${statusPill(row.ashimCertified ? 'ok' : 'warn')}`}>
                      {row.level}
                    </span>
                    <span className="rounded border border-[#34515f] bg-[#102531] px-2 py-1 text-[#b8dbeb]">
                      score {formatPct(row.score)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className={panelClass}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-[#e9edef]">Self-Host Readiness</h3>
            <span className={`rounded border px-2 py-1 text-xs ${statusPill(selfHostReport.ready ? 'ok' : 'fail')}`}>
              {selfHostReport.ready ? 'ready' : 'not ready'} • {formatPct(selfHostReport.score)}
            </span>
          </div>

          <div className="grid gap-2 md:grid-cols-3">
            {(['app', 'supabase-db', 'monitoring'] as const).map((service) => (
              <label key={service} className="rounded border border-[#27343d] bg-[#0f171c] p-3 text-xs">
                <div className="mb-1 text-[#d7e2e8]">{service}</div>
                <select
                  value={serviceStatuses[service]}
                  onChange={(event) =>
                    setServiceStatuses((current) => ({
                      ...current,
                      [service]: event.target.value as ServiceHealthStatus,
                    }))
                  }
                  className="w-full rounded border border-[#313d45] bg-[#111b21] px-2 py-1 text-[#dfe7eb]"
                >
                  <option value="healthy">healthy</option>
                  <option value="degraded">degraded</option>
                  <option value="down">down</option>
                </select>
              </label>
            ))}
          </div>

          {selfHostReport.blockers.length > 0 ? (
            <div className="mt-3 rounded border border-[#7b3b3b] bg-[#311414] p-3 text-xs text-[#f2c0c0]">
              {selfHostReport.blockers.join(' ')}
            </div>
          ) : null}
        </section>

        <section className={panelClass}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-[#e9edef]">Release Gate (v3.x)</h3>
            <span className={`rounded border px-2 py-1 text-xs ${statusPill(releaseReport.ready ? 'ok' : 'fail')}`}>
              {releaseReport.ready ? 'ship-ready' : 'blocked'} • {formatPct(releaseReport.score)}
            </span>
          </div>

          <div className="space-y-2">
            {releaseReport.checks.map((check) => (
              <div
                key={check.id}
                className="rounded border border-[#27343d] bg-[#0f171c] p-3 text-xs"
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[#e9edef]">{check.label}</div>
                  <div className="flex gap-1">
                    {(['pass', 'warn', 'fail'] as const).map((status) => (
                      <button
                        key={`${check.id}-${status}`}
                        type="button"
                        className={`rounded border px-2 py-0.5 ${
                          (releaseStatuses[check.id] ?? check.status) === status
                            ? 'border-[#00a884] bg-[#173b38] text-[#dffaf3]'
                            : 'border-[#3a4a53] text-[#8ea1ab]'
                        }`}
                        onClick={() =>
                          setReleaseStatuses((current) => ({
                            ...current,
                            [check.id]: status,
                          }))
                        }
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="text-[#8ea1ab]">
                  {check.category} {check.required ? '• required' : '• optional'}
                  {check.detail ? ` • ${check.detail}` : ''}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
