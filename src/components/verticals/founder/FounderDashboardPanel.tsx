import React from 'react';

interface FounderOKR {
  id: string;
  title: string;
  progress: number;
  status: 'on_track' | 'at_risk' | 'off_track';
}

interface FounderDecision {
  id: string;
  title: string;
  urgency: 'high' | 'medium' | 'low';
  owner: string;
  dueAtIso?: string;
}

interface FounderUpdate {
  id: string;
  label: string;
  status: 'drafting' | 'ready' | 'sent';
  updatedAtIso: string;
}

interface FounderTeamHealth {
  id: string;
  area: string;
  score: number;
}

interface FounderDashboardPanelProps {
  userId: string;
  okrs?: FounderOKR[];
  decisions?: FounderDecision[];
  investorUpdates?: FounderUpdate[];
  teamHealth?: FounderTeamHealth[];
}

const statusColor = (status: FounderOKR['status']): string => {
  if (status === 'on_track') return 'text-emerald-300';
  if (status === 'at_risk') return 'text-amber-300';
  return 'text-rose-300';
};

const urgencyBadge = (urgency: FounderDecision['urgency']): string => {
  if (urgency === 'high') return 'bg-rose-900/60 text-rose-200 border-rose-800';
  if (urgency === 'medium') return 'bg-amber-900/50 text-amber-200 border-amber-800';
  return 'bg-slate-800 text-slate-200 border-slate-700';
};

const defaultOkrs: FounderOKR[] = [
  {
    id: 'okr-1',
    title: 'Improve weekly retained users by 12%',
    progress: 0.64,
    status: 'on_track',
  },
  {
    id: 'okr-2',
    title: 'Ship API protocol hardening milestones',
    progress: 0.52,
    status: 'at_risk',
  },
  {
    id: 'okr-3',
    title: 'Close 2 strategic hiring roles',
    progress: 0.33,
    status: 'off_track',
  },
];

const defaultDecisions: FounderDecision[] = [
  {
    id: 'decision-1',
    title: 'Fundraise now vs extend bootstrap runway',
    urgency: 'high',
    owner: 'Founder',
    dueAtIso: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'decision-2',
    title: 'Prioritize enterprise pilot vs SMB growth loop',
    urgency: 'medium',
    owner: 'Product Lead',
  },
];

const defaultUpdates: FounderUpdate[] = [
  {
    id: 'update-1',
    label: 'Weekly investor update',
    status: 'drafting',
    updatedAtIso: new Date().toISOString(),
  },
  {
    id: 'update-2',
    label: 'Monthly board snapshot',
    status: 'ready',
    updatedAtIso: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
  },
];

const defaultTeamHealth: FounderTeamHealth[] = [
  {
    id: 'team-1',
    area: 'Execution rhythm',
    score: 0.78,
  },
  {
    id: 'team-2',
    area: 'Hiring throughput',
    score: 0.54,
  },
  {
    id: 'team-3',
    area: 'Cross-team alignment',
    score: 0.7,
  },
];

export const FounderDashboardPanel: React.FC<FounderDashboardPanelProps> = ({
  userId,
  okrs = defaultOkrs,
  decisions = defaultDecisions,
  investorUpdates = defaultUpdates,
  teamHealth = defaultTeamHealth,
}) => {
  return (
    <div className="h-full overflow-y-auto bg-[#0b141a] p-4">
      <div className="mx-auto max-w-6xl space-y-4">
        <section className="rounded-xl border border-[#313d45] bg-[#111b21] p-4">
          <h2 className="text-lg font-semibold text-[#e9edef]">Founder Dashboard</h2>
          <p className="mt-1 text-sm text-[#9fb0b8]">
            Weekly operating snapshot for user <span className="font-mono text-[#7ed0f3]">{userId}</span>.
          </p>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-xl border border-[#313d45] bg-[#111b21] p-4">
            <h3 className="mb-3 text-sm font-semibold text-[#e9edef]">OKR Progress Tracker</h3>
            <ul className="space-y-3">
              {okrs.map((okr) => (
                <li key={okr.id} className="rounded border border-[#27343d] bg-[#0f171d] p-3">
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <p className="text-sm text-[#d7e1e7]">{okr.title}</p>
                    <span className={`text-xs font-semibold uppercase tracking-wider ${statusColor(okr.status)}`}>
                      {okr.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded bg-[#24333c]">
                    <div
                      className="h-full bg-[#00a884]"
                      style={{ width: `${Math.round(Math.max(0, Math.min(1, okr.progress)) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </article>

          <article className="rounded-xl border border-[#313d45] bg-[#111b21] p-4">
            <h3 className="mb-3 text-sm font-semibold text-[#e9edef]">Decision Pipeline</h3>
            <ul className="space-y-3">
              {decisions.map((decision) => (
                <li key={decision.id} className="rounded border border-[#27343d] bg-[#0f171d] p-3">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <p className="text-sm text-[#d7e1e7]">{decision.title}</p>
                    <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold uppercase ${urgencyBadge(decision.urgency)}`}>
                      {decision.urgency}
                    </span>
                  </div>
                  <p className="text-xs text-[#8fa3af]">Owner: {decision.owner}</p>
                  {decision.dueAtIso ? (
                    <p className="text-xs text-[#8fa3af]">Due: {new Date(decision.dueAtIso).toLocaleDateString()}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </article>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-xl border border-[#313d45] bg-[#111b21] p-4">
            <h3 className="mb-3 text-sm font-semibold text-[#e9edef]">Investor Update Draft Status</h3>
            <ul className="space-y-2 text-sm text-[#d2dee5]">
              {investorUpdates.map((update) => (
                <li key={update.id} className="rounded border border-[#27343d] bg-[#0f171d] p-3">
                  <p>{update.label}</p>
                  <p className="text-xs text-[#8fa3af]">
                    {update.status} • {new Date(update.updatedAtIso).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          </article>

          <article className="rounded-xl border border-[#313d45] bg-[#111b21] p-4">
            <h3 className="mb-3 text-sm font-semibold text-[#e9edef]">Team Health Indicators</h3>
            <ul className="space-y-2">
              {teamHealth.map((item) => (
                <li key={item.id} className="rounded border border-[#27343d] bg-[#0f171d] p-3">
                  <div className="mb-1 flex items-center justify-between text-sm text-[#d2dee5]">
                    <span>{item.area}</span>
                    <span>{Math.round(item.score * 100)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded bg-[#24333c]">
                    <div className="h-full bg-[#7ed0f3]" style={{ width: `${Math.round(item.score * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </article>
        </section>
      </div>
    </div>
  );
};
