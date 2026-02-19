import { describe, expect, it } from 'vitest';
import { AutonomyGuardrails } from '../../autonomy/guardrails';
import { PlanEngine } from '../../autonomy/planEngine';
import {
  WorkflowEngine,
  WorkflowStore,
  createInMemoryWorkflowStoreAdapter,
} from '../../workflows';
import { generatePersonalProtocol } from '../protocolGenerator';
import { ProtocolRunner } from '../protocolRunner';

describe('ProtocolRunner', () => {
  it('activates protocol, tracks adherence, adapts next day, and can trigger autonomy', async () => {
    const workflowStore = new WorkflowStore(createInMemoryWorkflowStoreAdapter());
    const localWorkflowEngine = new WorkflowEngine({
      store: workflowStore,
    });
    const runner = new ProtocolRunner({
      workflowEngine: localWorkflowEngine,
      nowIso: () => '2026-04-06T09:00:00.000Z',
    });

    const guardrails = new AutonomyGuardrails({
      nowIso: () => '2026-04-06T09:00:00.000Z',
    });
    const autonomy = new PlanEngine({
      guardrails,
      nowIso: () => '2026-04-06T09:00:00.000Z',
    });

    const protocol = generatePersonalProtocol({
      userId: 'user-1',
      workspaceId: 'workspace-1',
      nowIso: '2026-04-06T08:00:00.000Z',
      values: [
        {
          id: 'value-deep-work',
          title: 'Deep Work',
          description: 'Protect focus time',
          confidence: 0.9,
          evidence: ['workflow.completed'],
        },
      ],
      goals: ['Prepare Monday presentation'],
    });

    const activation = runner.activateProtocol({
      workspaceId: 'workspace-1',
      userId: 'user-1',
      protocol,
    });
    expect(activation.createdWorkflowIds.length).toBeGreaterThan(0);
    expect(activation.scheduledCheckInIds.length).toBeGreaterThan(0);

    const before = runner.getActiveProtocol('workspace-1');
    expect(before).not.toBeNull();
    const tuesdayBefore = before!.days.find((day) => day.weekday === 'tuesday');
    expect(tuesdayBefore).toBeTruthy();
    const tuesdayBeforeSnapshot = tuesdayBefore!.activities.map((activity) => ({
      id: activity.id,
      startTime: activity.startTime,
      durationMinutes: activity.durationMinutes,
    }));

    const outcomeSignals: Array<{ adherenceRate: number }> = [];
    const monday = before!.days.find((day) => day.weekday === 'monday')!;
    const lowAdherenceMap = Object.fromEntries(
      monday.activities.map((activity) => [
        activity.id,
        activity.type === 'focus_block' ? ('partial' as const) : ('missed' as const),
      ])
    );

    const day1 = await runner.executeDay({
      workspaceId: 'workspace-1',
      userId: 'user-1',
      dateIso: '2026-04-06T10:00:00.000Z',
      adherenceByActivityId: lowAdherenceMap,
      autonomyExecutor: ({ prompt }) => {
        const plan = autonomy.createPlan({
          userId: 'user-1',
          workspaceId: 'workspace-1',
          goal: prompt,
          durationDays: 1,
        });
        return { planId: plan.id };
      },
      outcomeNotifier: ({ adherenceRate }) => outcomeSignals.push({ adherenceRate }),
    });

    expect(day1.missed).toBe(monday.activities.length - 1);
    expect(day1.partial).toBe(1);
    expect(day1.adherenceRate).toBeLessThan(0.6);
    expect(day1.generatedAutonomousPlanIds.length).toBeGreaterThan(0);
    expect(outcomeSignals).toHaveLength(1);

    const after = runner.getActiveProtocol('workspace-1');
    const tuesdayAfter = after!.days.find((day) => day.weekday === 'tuesday')!;
    expect(tuesdayAfter.activities.length).toBe(tuesdayBeforeSnapshot.length);
    expect(
      tuesdayAfter.activities.some((activity, index) => {
        const previous = tuesdayBeforeSnapshot[index];
        return (
          activity.startTime !== previous.startTime ||
          activity.durationMinutes !== previous.durationMinutes
        );
      })
    ).toBe(true);

    const day2 = await runner.executeDay({
      workspaceId: 'workspace-1',
      userId: 'user-1',
      dateIso: '2026-04-07T10:00:00.000Z',
    });
    expect(day2.completed).toBeGreaterThan(0);

    const adherence = runner.listAdherence({
      protocolId: activation.protocolId,
    });
    expect(adherence.length).toBeGreaterThanOrEqual(
      monday.activities.length + tuesdayAfter.activities.length
    );
  });
});
