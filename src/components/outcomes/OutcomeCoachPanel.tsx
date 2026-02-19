import React, { useEffect, useMemo, useState } from 'react';
import { listActivityEvents } from '../../activity';
import {
  buildWeeklyOutcomeScorecard,
  createOutcomeGoal,
  generateOutcomeCorrelationReport,
  generateOutcomeNudges,
  listOutcomeCheckIns,
  listOutcomeGoals,
  recordOutcomeCheckIn,
  assessOutcomeGoal,
  type OutcomeGoal,
  type OutcomeMetricValue,
} from '../../outcomes';
import { createDefaultQuietWindowsConfig } from '../../voice/quietWindows';

interface OutcomeCoachPanelProps {
  userId: string;
}

const panelClass = 'rounded-xl border border-[#313d45] bg-[#111b21] p-4 text-sm text-[#c7d0d6]';

const toMs = (iso: string): number => {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const pct = (value: number): string => `${Math.round(value * 100)}%`;

const ProgressBar = ({ value }: { value: number }) => (
  <div className="h-2 rounded bg-[#1f2b33]">
    <div className="h-2 rounded bg-[#00a884]" style={{ width: pct(value) }} />
  </div>
);

const quickCheckInValues = (goal: OutcomeGoal): Record<string, OutcomeMetricValue> => {
  const values: Record<string, OutcomeMetricValue> = {};

  for (const metric of goal.metrics) {
    if (metric.type === 'binary') {
      values[metric.id] = true;
      continue;
    }

    if (metric.type === 'qualitative') {
      values[metric.id] = 'good';
      continue;
    }

    const currentNum = Number(metric.currentValue ?? 0);
    const targetNum = Number(metric.targetValue);
    if (!Number.isFinite(targetNum)) {
      values[metric.id] = currentNum + 1;
      continue;
    }

    const increment = metric.type === 'percentage' ? 8 : Math.max(1, Math.round(targetNum * 0.12));
    values[metric.id] = currentNum + increment;
  }

  return values;
};

const seedDemoOutcomes = (userId: string): OutcomeGoal[] => {
  const nowIso = new Date().toISOString();

  const goal = createOutcomeGoal({
    userId,
    title: 'Increase deep work consistency',
    description: 'Raise weekly deep work completion and retention quality.',
    checkInFrequency: 'daily',
    metrics: [
      {
        id: 'metric-deep-work',
        label: 'Deep work blocks',
        type: 'numeric',
        direction: 'increase',
        targetValue: 12,
        currentValue: 2,
      },
      {
        id: 'metric-retention',
        label: 'Retention delta',
        type: 'percentage',
        direction: 'increase',
        targetValue: 15,
        currentValue: 4,
      },
      {
        id: 'metric-weekly-review',
        label: 'Weekly review done',
        type: 'binary',
        direction: 'increase',
        targetValue: true,
        currentValue: false,
      },
    ],
    milestones: [
      {
        id: 'milestone-1',
        title: 'Sustain 6 deep work blocks/week',
        targetDateIso: new Date(toMs(nowIso) + 7 * 24 * 60 * 60 * 1000).toISOString(),
        metricId: 'metric-deep-work',
        targetValue: 6,
        status: 'pending',
      },
      {
        id: 'milestone-2',
        title: 'Reach +10% retention delta',
        targetDateIso: new Date(toMs(nowIso) + 14 * 24 * 60 * 60 * 1000).toISOString(),
        metricId: 'metric-retention',
        targetValue: 10,
        status: 'pending',
      },
      {
        id: 'milestone-3',
        title: 'Complete weekly review loop',
        targetDateIso: new Date(toMs(nowIso) + 21 * 24 * 60 * 60 * 1000).toISOString(),
        metricId: 'metric-weekly-review',
        targetValue: true,
        status: 'pending',
      },
    ],
    linkedWorkflows: ['workflow-focus-daily'],
    linkedDecisions: ['decision-prioritization-loop'],
    linkedHabits: ['habit-shutdown-routine'],
    nowIso,
  });

  recordOutcomeCheckIn({
    userId,
    goalId: goal.id,
    atIso: new Date(toMs(nowIso) - 2 * 24 * 60 * 60 * 1000).toISOString(),
    metricValues: {
      'metric-deep-work': 4,
      'metric-retention': 6,
      'metric-weekly-review': false,
    },
  });

  recordOutcomeCheckIn({
    userId,
    goalId: goal.id,
    atIso: new Date(toMs(nowIso) - 1 * 24 * 60 * 60 * 1000).toISOString(),
    metricValues: {
      'metric-deep-work': 6,
      'metric-retention': 8,
      'metric-weekly-review': true,
    },
  });

  return [goal];
};

export const OutcomeCoachPanel: React.FC<OutcomeCoachPanelProps> = ({ userId }) => {
  const [refreshTick, setRefreshTick] = useState(0);
  const [status, setStatus] = useState('');
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(0);

  const refresh = () => setRefreshTick((tick) => tick + 1);

  useEffect(() => {
    setNowMs(Date.now());
  }, [refreshTick, userId]);

  const goals = useMemo(() => {
    void refreshTick;
    return listOutcomeGoals({
      userId,
      statuses: ['active', 'completed', 'paused'],
      limit: 120,
    });
  }, [refreshTick, userId]);

  useEffect(() => {
    if (!selectedGoalId && goals.length > 0) {
      setSelectedGoalId(goals[0].id);
    }
  }, [goals, selectedGoalId]);

  const assessments = useMemo(() => {
    return goals.map((goal) => ({
      goal,
      assessment: assessOutcomeGoal({
        goal,
      }),
    }));
  }, [goals]);

  const scorecard = useMemo(
    () =>
      buildWeeklyOutcomeScorecard({
        userId,
      }),
    [userId]
  );

  const activityEvents = useMemo(
    () =>
      listActivityEvents({
        userId,
        limit: 1200,
      }),
    [userId]
  );

  const selectedGoal = useMemo(() => goals.find((goal) => goal.id === selectedGoalId) ?? goals[0] ?? null, [goals, selectedGoalId]);

  const correlationReport = useMemo(() => {
    if (!selectedGoal) return null;
    return generateOutcomeCorrelationReport({
      userId,
      goalId: selectedGoal.id,
      activityEvents,
    });
  }, [activityEvents, selectedGoal, userId]);

  const nudgeBatch = useMemo(() => {
    return generateOutcomeNudges({
      userId,
      assessments: assessments.map((entry) => entry.assessment),
      goals,
      quietWindowsConfig: createDefaultQuietWindowsConfig(),
    });
  }, [assessments, goals, userId]);

  const runQuickCheckIn = (goal: OutcomeGoal) => {
    const logged = recordOutcomeCheckIn({
      userId,
      goalId: goal.id,
      metricValues: quickCheckInValues(goal),
      note: 'Quick check-in from Outcome Coach panel.',
    });

    if (!logged) {
      setStatus('Unable to log check-in for selected goal.');
      return;
    }

    setStatus(`Logged quick check-in for ${goal.title}.`);
    refresh();
  };

  const upcomingMilestones = useMemo(() => {
    return goals
      .flatMap((goal) =>
        goal.milestones.map((milestone) => ({
          goalTitle: goal.title,
          ...milestone,
        }))
      )
      .filter((milestone) => milestone.status !== 'completed')
      .filter((milestone) => toMs(milestone.targetDateIso) <= nowMs + 7 * 24 * 60 * 60 * 1000)
      .sort((left, right) => toMs(left.targetDateIso) - toMs(right.targetDateIso))
      .slice(0, 8);
  }, [goals, nowMs]);

  const overdueMilestones = useMemo(() => {
    return goals
      .flatMap((goal) =>
        goal.milestones
          .filter((milestone) => milestone.status === 'overdue')
          .map((milestone) => ({
            goalTitle: goal.title,
            ...milestone,
          }))
      )
      .sort((left, right) => toMs(left.targetDateIso) - toMs(right.targetDateIso));
  }, [goals]);

  return (
    <div className="h-full overflow-y-auto bg-[#0b141a] p-4">
      <div className="mx-auto max-w-7xl space-y-4">
        <header className={panelClass}>
          <h2 className="text-lg font-semibold text-[#e9edef]">Outcome Coach</h2>
          <p className="mt-1 text-sm text-[#8ea1ab]">
            Link decisions and workflows to measurable outcomes, then track weekly accountability.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded border border-[#4f6f84] px-3 py-2 text-xs text-[#bfd8e8] hover:bg-[#1d3140]"
              onClick={() => {
                seedDemoOutcomes(userId);
                setStatus('Seeded demo outcome with milestones and check-ins.');
                refresh();
              }}
            >
              Seed Demo Outcome
            </button>
            <button
              type="button"
              className="rounded border border-[#4f6f84] px-3 py-2 text-xs text-[#bfd8e8] hover:bg-[#1d3140]"
              onClick={refresh}
            >
              Refresh
            </button>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <article className={panelClass}>
            <div className="text-xs text-[#8ea1ab]">Active outcomes</div>
            <div className="mt-1 text-xl text-[#e9edef]">{scorecard.activeOutcomes}</div>
          </article>
          <article className={panelClass}>
            <div className="text-xs text-[#8ea1ab]">This week check-ins</div>
            <div className="mt-1 text-xl text-[#e9edef]">{scorecard.checkInsLogged}</div>
          </article>
          <article className={panelClass}>
            <div className="text-xs text-[#8ea1ab]">Milestones completed</div>
            <div className="mt-1 text-xl text-[#e9edef]">
              {scorecard.completedMilestones}/{scorecard.totalMilestones}
            </div>
          </article>
          <article className={panelClass}>
            <div className="text-xs text-[#8ea1ab]">Weekly scorecard</div>
            <div className="mt-1 text-xs text-[#d7e1e6]">
              {scorecard.assessmentsByStatus.on_track} on-track, {scorecard.assessmentsByStatus.at_risk} at-risk,
              {' '}
              {scorecard.assessmentsByStatus.behind} behind, {scorecard.assessmentsByStatus.achieved} achieved.
            </div>
          </article>
        </section>

        <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
          <section className={panelClass}>
            <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Active Outcomes</h3>
            {assessments.length === 0 ? (
              <div className="rounded border border-[#2d3942] bg-[#0d151a] p-3 text-xs text-[#8ea1ab]">
                No outcomes yet. Seed demo data or create goals through the tracker API.
              </div>
            ) : (
              <div className="space-y-3">
                {assessments.map(({ goal, assessment }) => {
                  const checkInCount = listOutcomeCheckIns({ userId, goalId: goal.id, limit: 90 }).length;
                  const selected = selectedGoal?.id === goal.id;
                  return (
                    <article
                      key={goal.id}
                      className={`rounded border p-3 text-xs ${
                        selected
                          ? 'border-[#00a884] bg-[#173b38]'
                          : 'border-[#2d3942] bg-[#0f171c]'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedGoalId(goal.id)}
                          className="text-left text-sm text-[#e9edef]"
                        >
                          {goal.title}
                        </button>
                        <span className="rounded border border-[#3f5968] px-2 py-0.5 text-[11px] text-[#bfd8e8]">
                          {assessment.status}
                        </span>
                      </div>
                      <div className="mt-1 text-[#9fb0ba]">{assessment.summary}</div>
                      <div className="mt-2">
                        <ProgressBar value={assessment.progressScore} />
                        <div className="mt-1 text-[11px] text-[#8ea1ab]">{pct(assessment.progressScore)} progress</div>
                      </div>
                      <div className="mt-2 text-[11px] text-[#8ea1ab]">
                        Milestones: {assessment.milestonesCompleted}/{assessment.milestonesTotal} • Check-ins: {checkInCount}
                      </div>
                      <button
                        type="button"
                        className="mt-2 rounded border border-[#4f6f84] px-2 py-1 text-[11px] text-[#bfd8e8] hover:bg-[#1d3140]"
                        onClick={() => runQuickCheckIn(goal)}
                      >
                        Log Quick Check-in
                      </button>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className={panelClass}>
            <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Milestone Alerts</h3>
            <div className="space-y-2 text-xs">
              {overdueMilestones.length > 0 ? (
                overdueMilestones.map((milestone) => (
                  <div key={`overdue-${milestone.id}`} className="rounded border border-[#6b3a3a] bg-[#2d1414] p-3 text-[#f0c2c2]">
                    <div className="text-[#ffd1d1]">Overdue: {milestone.title}</div>
                    <div className="mt-1">{milestone.goalTitle} • due {new Date(milestone.targetDateIso).toLocaleDateString()}</div>
                  </div>
                ))
              ) : (
                <div className="rounded border border-[#2d3942] bg-[#0d151a] p-3 text-[#8ea1ab]">No overdue milestones.</div>
              )}

              {upcomingMilestones.map((milestone) => (
                <div key={`upcoming-${milestone.id}`} className="rounded border border-[#2d3942] bg-[#0d151a] p-3 text-[#c2d2d9]">
                  <div className="text-[#e9edef]">Upcoming: {milestone.title}</div>
                  <div className="mt-1 text-[#8ea1ab]">
                    {milestone.goalTitle} • due {new Date(milestone.targetDateIso).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className={panelClass}>
            <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Correlation Insights</h3>
            {correlationReport ? (
              <div className="space-y-2 text-xs">
                <div className="rounded border border-[#2d3942] bg-[#0d151a] p-3 text-[#c2d2d9]">
                  {correlationReport.narrative}
                </div>
                {correlationReport.factors.slice(0, 5).map((factor) => (
                  <div key={factor.id} className="rounded border border-[#2d3942] bg-[#0d151a] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[#e9edef]">{factor.label}</span>
                      <span className="text-[#8ea1ab]">corr {factor.correlation.toFixed(2)}</span>
                    </div>
                    <div className="mt-1 text-[#8ea1ab]">{Math.round(factor.confidence * 100)}% confidence • {factor.evidence}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded border border-[#2d3942] bg-[#0d151a] p-3 text-xs text-[#8ea1ab]">
                Select an outcome to inspect correlation signals.
              </div>
            )}
          </section>

          <section className={panelClass}>
            <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Outcome Nudges</h3>
            <div className="mb-2 text-xs text-[#8ea1ab]">{nudgeBatch.deferredCount} deferred by quiet-window policy.</div>
            <div className="space-y-2 text-xs">
              {nudgeBatch.nudges.length === 0 ? (
                <div className="rounded border border-[#2d3942] bg-[#0d151a] p-3 text-[#8ea1ab]">No nudges right now.</div>
              ) : (
                nudgeBatch.nudges.map((nudge) => (
                  <div key={nudge.id} className="rounded border border-[#2d3942] bg-[#0d151a] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[#e9edef]">{nudge.title}</span>
                      <span className="text-[#8ea1ab]">{nudge.priority}</span>
                    </div>
                    <div className="mt-1 text-[#9fb0ba]">{nudge.message}</div>
                    {nudge.deferred && nudge.deliverAfterIso ? (
                      <div className="mt-1 text-[#7f939d]">Deferred until {new Date(nudge.deliverAfterIso).toLocaleTimeString()}</div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {status ? (
          <div className="rounded border border-[#2d3942] bg-[#0d151a] px-3 py-2 text-xs text-[#aebec8]">{status}</div>
        ) : null}
      </div>
    </div>
  );
};

export default OutcomeCoachPanel;
