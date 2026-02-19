import React, { useEffect, useMemo, useState } from 'react';
import { listActivityEvents } from '../../activity';
import { autonomyPlanEngine } from '../../autonomy';
import { listOutcomeGoals } from '../../outcomes';
import {
  extractCoreValues,
  generatePersonalProtocol,
  protocolRunner,
  type ExtractedValue,
  type PersonalProtocol,
} from '../../protocol';

interface ProtocolCompilerPanelProps {
  userId: string;
  workspaceId?: string;
}

const panelClass = 'rounded-xl border border-[#313d45] bg-[#111b21] p-4 text-sm text-[#c7d0d6]';

const summarizeAdherence = (records: ReadonlyArray<{ score: number; status: string }>) => {
  if (records.length === 0) {
    return {
      rate: 0,
      completed: 0,
      partial: 0,
      missed: 0,
    };
  }

  let completed = 0;
  let partial = 0;
  let missed = 0;
  let scoreSum = 0;

  for (const record of records) {
    if (record.status === 'completed') completed += 1;
    if (record.status === 'partial') partial += 1;
    if (record.status === 'missed') missed += 1;
    scoreSum += record.score;
  }

  return {
    rate: scoreSum / records.length,
    completed,
    partial,
    missed,
  };
};

export const ProtocolCompilerPanel: React.FC<ProtocolCompilerPanelProps> = ({
  userId,
  workspaceId = `workspace-${userId}`,
}) => {
  const [values, setValues] = useState<ExtractedValue[]>([]);
  const [protocol, setProtocol] = useState<PersonalProtocol | null>(null);
  const [status, setStatus] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);

  const compileFromHistory = () => {
    const events = listActivityEvents({
      userId,
      limit: 240,
    });
    const goals = listOutcomeGoals({
      userId,
      statuses: ['active', 'paused', 'completed'],
    });

    const extracted = extractCoreValues({
      userId,
      windowDays: 60,
      events: events.map((event) => ({
        title: event.title,
        description: event.description,
        eventType: event.eventType,
        category: event.category,
        createdAtIso: event.createdAtIso,
      })),
      goals: goals.map((goal) => ({
        title: goal.title,
        status: goal.status,
        note: goal.description,
        updatedAtIso: goal.updatedAtIso,
      })),
      reflections: events
        .filter((event) => event.category === 'reflection')
        .map((event) => ({
          text: `${event.title} ${event.description}`,
          sentiment: 'neutral' as const,
          createdAtIso: event.createdAtIso,
        })),
    });

    const generated = generatePersonalProtocol({
      userId,
      workspaceId,
      values: extracted,
      goals: goals.map((goal) => goal.title).slice(0, 4),
      nowIso: new Date().toISOString(),
    });

    setValues(extracted);
    setProtocol(generated);
    setStatus(`Extracted ${extracted.length} values and generated weekly protocol.`);
  };

  useEffect(() => {
    compileFromHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, workspaceId]);

  const activation = useMemo(() => {
    void refreshTick;
    return protocolRunner.getActivation(workspaceId);
  }, [refreshTick, workspaceId]);

  const adherenceSummary = useMemo(() => {
    void refreshTick;
    if (!activation?.protocolId) {
      return summarizeAdherence([]);
    }
    const records = protocolRunner.listAdherence({
      protocolId: activation.protocolId,
      limit: 300,
    });
    return summarizeAdherence(records);
  }, [activation?.protocolId, refreshTick]);

  const updateValue = (valueId: string, patch: Partial<ExtractedValue>) => {
    setValues((current) =>
      current.map((value) => (value.id === valueId ? { ...value, ...patch } : value))
    );
  };

  const regenerateProtocol = () => {
    const next = generatePersonalProtocol({
      userId,
      workspaceId,
      values,
      goals: protocol?.goals ?? [],
      nowIso: new Date().toISOString(),
    });
    setProtocol(next);
    setStatus('Regenerated protocol from edited values.');
  };

  const activateProtocol = () => {
    if (!protocol) {
      setStatus('Generate protocol first.');
      return;
    }
    const result = protocolRunner.activateProtocol({
      workspaceId,
      userId,
      protocol,
    });
    setStatus(
      `Protocol activated: ${result.createdWorkflowIds.length} workflows, ${result.scheduledCheckInIds.length} check-ins.`
    );
    setRefreshTick((tick) => tick + 1);
  };

  const runToday = async () => {
    if (!protocol) {
      setStatus('Generate protocol first.');
      return;
    }

    try {
      const report = await protocolRunner.executeDay({
        workspaceId,
        userId,
        dateIso: new Date().toISOString(),
        autonomyExecutor: async ({ prompt }) => {
          const plan = autonomyPlanEngine.createPlan({
            userId,
            workspaceId,
            goal: prompt,
            durationDays: 1,
          });
          await autonomyPlanEngine.executeDay({
            planId: plan.id,
            dayIndex: 0,
          });
          return { planId: plan.id };
        },
        outcomeNotifier: ({ adherenceRate }) => {
          setStatus(`Outcome coach signal emitted. Adherence ${Math.round(adherenceRate * 100)}%.`);
        },
      });

      setStatus(
        `Ran ${report.weekday}: adherence ${Math.round(report.adherenceRate * 100)}%, autonomous plans ${report.generatedAutonomousPlanIds.length}.`
      );
      setRefreshTick((tick) => tick + 1);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to run protocol for today.');
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-[#0b141a] p-4">
      <div className="mx-auto max-w-6xl space-y-4">
        <section className={panelClass}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[#e9edef]">Protocol Compiler</h2>
              <p className="mt-1 text-sm text-[#9fb0b8]">
                Compile values and goals into a weekly operating protocol, then execute and adapt.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded border border-[#3f6d80] px-3 py-1.5 text-xs text-[#b8dced] hover:bg-[#1d3f4d]"
                onClick={compileFromHistory}
              >
                Re-extract Values
              </button>
              <button
                type="button"
                className="rounded border border-[#355f4f] px-3 py-1.5 text-xs text-[#b8e9d4] hover:bg-[#173326]"
                onClick={regenerateProtocol}
              >
                Regenerate Protocol
              </button>
              <button
                type="button"
                className="rounded border border-[#2f6b52] px-3 py-1.5 text-xs text-[#b7ebcb] hover:bg-[#133527]"
                onClick={activateProtocol}
              >
                Activate Protocol
              </button>
              <button
                type="button"
                className="rounded border border-[#6d6338] px-3 py-1.5 text-xs text-[#f1e5ae] hover:bg-[#342c14]"
                onClick={() => {
                  void runToday();
                }}
              >
                Run Today
              </button>
            </div>
          </div>
        </section>

        <section className={panelClass}>
          <h3 className="mb-3 text-sm font-semibold text-[#e9edef]">Extracted Values</h3>
          {values.length === 0 ? (
            <div className="rounded border border-[#27343d] bg-[#0f171c] p-3 text-xs text-[#8ea1ab]">
              No values extracted yet.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {values.map((value) => (
                <article key={value.id} className="rounded border border-[#27343d] bg-[#0f171c] p-3 text-xs">
                  <input
                    value={value.title}
                    onChange={(event) => updateValue(value.id, { title: event.target.value })}
                    className="w-full rounded border border-[#2a3a44] bg-[#0d151a] px-2 py-1 text-sm text-[#e9edef]"
                  />
                  <textarea
                    value={value.description}
                    onChange={(event) => updateValue(value.id, { description: event.target.value })}
                    className="mt-2 h-16 w-full rounded border border-[#2a3a44] bg-[#0d151a] px-2 py-1 text-xs text-[#c7d0d6]"
                  />
                  <div className="mt-1 text-[#8ea1ab]">confidence {Math.round(value.confidence * 100)}%</div>
                  <ul className="mt-2 space-y-1 text-[#aebec8]">
                    {value.evidence.slice(0, 3).map((evidence) => (
                      <li key={`${value.id}-${evidence}`}>• {evidence}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className={panelClass}>
          <h3 className="mb-3 text-sm font-semibold text-[#e9edef]">Protocol Preview</h3>
          {!protocol ? (
            <div className="rounded border border-[#27343d] bg-[#0f171c] p-3 text-xs text-[#8ea1ab]">
              Generate a protocol to preview weekly schedule.
            </div>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {protocol.days.map((day) => (
                <article key={day.weekday} className="rounded border border-[#27343d] bg-[#0f171c] p-3 text-xs">
                  <div className="text-sm text-[#e9edef]">
                    {day.weekday[0].toUpperCase() + day.weekday.slice(1)}
                  </div>
                  <div className="mt-1 text-[#8ea1ab]">{day.theme}</div>
                  <ul className="mt-2 space-y-1 text-[#c7d0d6]">
                    {day.activities.map((activity) => (
                      <li key={activity.id}>
                        {activity.startTime} • {activity.title} ({activity.durationMinutes}m)
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className={panelClass}>
          <h3 className="mb-3 text-sm font-semibold text-[#e9edef]">Adherence Dashboard</h3>
          <div className="grid gap-2 sm:grid-cols-4">
            <div className="rounded border border-[#27343d] bg-[#0f171c] p-2 text-xs">
              <div className="text-[#8ea1ab]">Adherence</div>
              <div className="mt-1 text-base text-[#e9edef]">{Math.round(adherenceSummary.rate * 100)}%</div>
            </div>
            <div className="rounded border border-[#27343d] bg-[#0f171c] p-2 text-xs">
              <div className="text-[#8ea1ab]">Completed</div>
              <div className="mt-1 text-base text-[#e9edef]">{adherenceSummary.completed}</div>
            </div>
            <div className="rounded border border-[#27343d] bg-[#0f171c] p-2 text-xs">
              <div className="text-[#8ea1ab]">Partial</div>
              <div className="mt-1 text-base text-[#e9edef]">{adherenceSummary.partial}</div>
            </div>
            <div className="rounded border border-[#27343d] bg-[#0f171c] p-2 text-xs">
              <div className="text-[#8ea1ab]">Missed</div>
              <div className="mt-1 text-base text-[#e9edef]">{adherenceSummary.missed}</div>
            </div>
          </div>
        </section>

        {status ? (
          <section className="rounded-xl border border-[#2d3942] bg-[#0d151a] px-4 py-3 text-xs text-[#aebec8]">
            {status}
          </section>
        ) : null}
      </div>
    </div>
  );
};

export default ProtocolCompilerPanel;
