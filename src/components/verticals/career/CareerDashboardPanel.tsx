import React from 'react';

interface CareerPipelineItem {
  id: string;
  company: string;
  stage: 'applied' | 'screen' | 'interview' | 'offer';
  nextAction: string;
}

interface SkillGapItem {
  id: string;
  skill: string;
  current: number;
  target: number;
}

interface OfferComparisonItem {
  id: string;
  title: string;
  score: number;
  notes: string;
}

interface CareerDashboardPanelProps {
  userId: string;
  pipeline?: CareerPipelineItem[];
  skillGaps?: SkillGapItem[];
  offers?: OfferComparisonItem[];
}

const defaultPipeline: CareerPipelineItem[] = [
  {
    id: 'career-pipeline-1',
    company: 'Northbound Systems',
    stage: 'interview',
    nextAction: 'Finalize STAR stories for architecture interview',
  },
  {
    id: 'career-pipeline-2',
    company: 'Atlas Labs',
    stage: 'screen',
    nextAction: 'Send targeted resume variation and follow up in 2 days',
  },
  {
    id: 'career-pipeline-3',
    company: 'Lumen Data',
    stage: 'offer',
    nextAction: 'Complete offer comparison worksheet before negotiation call',
  },
];

const defaultSkillGaps: SkillGapItem[] = [
  { id: 'skill-1', skill: 'System Design Storytelling', current: 0.56, target: 0.85 },
  { id: 'skill-2', skill: 'Stakeholder Narrative', current: 0.62, target: 0.82 },
  { id: 'skill-3', skill: 'Domain Metrics Depth', current: 0.49, target: 0.8 },
];

const defaultOffers: OfferComparisonItem[] = [
  {
    id: 'offer-1',
    title: 'Offer A (Growth-stage SaaS)',
    score: 0.78,
    notes: 'Strong scope growth, moderate comp upside.',
  },
  {
    id: 'offer-2',
    title: 'Offer B (Public Platform)',
    score: 0.72,
    notes: 'Higher base comp, slower trajectory.',
  },
];

const stageBadge = (stage: CareerPipelineItem['stage']): string => {
  if (stage === 'offer') return 'border-emerald-800 bg-emerald-900/50 text-emerald-200';
  if (stage === 'interview') return 'border-cyan-800 bg-cyan-900/50 text-cyan-200';
  if (stage === 'screen') return 'border-amber-800 bg-amber-900/50 text-amber-200';
  return 'border-slate-700 bg-slate-800 text-slate-200';
};

export const CareerDashboardPanel: React.FC<CareerDashboardPanelProps> = ({
  userId,
  pipeline = defaultPipeline,
  skillGaps = defaultSkillGaps,
  offers = defaultOffers,
}) => {
  return (
    <div className="h-full overflow-y-auto bg-[#0b141a] p-4">
      <div className="mx-auto max-w-6xl space-y-4">
        <section className="rounded-xl border border-[#313d45] bg-[#111b21] p-4">
          <h2 className="text-lg font-semibold text-[#e9edef]">Career Dashboard</h2>
          <p className="mt-1 text-sm text-[#9fb0b8]">
            Pipeline and positioning state for user <span className="font-mono text-[#7ed0f3]">{userId}</span>.
          </p>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-xl border border-[#313d45] bg-[#111b21] p-4">
            <h3 className="mb-3 text-sm font-semibold text-[#e9edef]">Active Opportunity Pipeline</h3>
            <ul className="space-y-2 text-sm">
              {pipeline.map((entry) => (
                <li key={entry.id} className="rounded border border-[#27343d] bg-[#0f171d] p-3">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="text-[#d7e1e7]">{entry.company}</p>
                    <span
                      className={`rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${stageBadge(entry.stage)}`}
                    >
                      {entry.stage}
                    </span>
                  </div>
                  <p className="text-xs text-[#8fa3af]">{entry.nextAction}</p>
                </li>
              ))}
            </ul>
          </article>

          <article className="rounded-xl border border-[#313d45] bg-[#111b21] p-4">
            <h3 className="mb-3 text-sm font-semibold text-[#e9edef]">Skill Gap Tracker</h3>
            <ul className="space-y-2">
              {skillGaps.map((item) => {
                const pct = Math.round(Math.max(0, Math.min(1, item.current / item.target)) * 100);
                return (
                  <li key={item.id} className="rounded border border-[#27343d] bg-[#0f171d] p-3">
                    <div className="mb-1 flex items-center justify-between text-sm text-[#d7e1e7]">
                      <span>{item.skill}</span>
                      <span>{pct}% toward target</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded bg-[#24333c]">
                      <div className="h-full bg-[#7ed0f3]" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </article>
        </section>

        <section className="rounded-xl border border-[#313d45] bg-[#111b21] p-4">
          <h3 className="mb-3 text-sm font-semibold text-[#e9edef]">Offer Decision Room Snapshot</h3>
          <div className="grid gap-2 md:grid-cols-2">
            {offers.map((offer) => (
              <article key={offer.id} className="rounded border border-[#27343d] bg-[#0f171d] p-3 text-sm">
                <p className="text-[#d7e1e7]">{offer.title}</p>
                <p className="text-xs text-[#7ed0f3]">Score: {Math.round(offer.score * 100)}%</p>
                <p className="mt-1 text-xs text-[#8fa3af]">{offer.notes}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
