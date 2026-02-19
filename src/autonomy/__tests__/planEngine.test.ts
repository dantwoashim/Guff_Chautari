import { describe, expect, it } from 'vitest';
import { AutonomyGuardrails } from '../guardrails';
import { PlanEngine } from '../planEngine';

describe('PlanEngine', () => {
  it('adapts a multi-day plan when a task fails mid-run', async () => {
    const guardrails = new AutonomyGuardrails({
      nowIso: () => '2026-03-01T09:00:00.000Z',
    });
    const engine = new PlanEngine({
      guardrails,
      nowIso: () => '2026-03-01T09:00:00.000Z',
    });

    const plan = engine.createPlan({
      userId: 'user-1',
      workspaceId: 'workspace-1',
      goal: 'Prepare launch readiness report',
      durationDays: 5,
      seedTasksByDay: [
        [{ title: 'Day 1 research', description: 'Research constraints' }],
        [{ title: 'Day 2 synthesis', description: 'Synthesize findings' }],
        [{ title: 'Day 3 recovery placeholder', description: 'Placeholder' }],
        [{ title: 'Day 4 draft', description: 'Draft final output' }],
        [{ title: 'Day 5 review', description: 'Review and publish' }],
      ],
    });

    const day1 = await engine.executeDay({
      planId: plan.id,
      dayIndex: 0,
      taskExecutor: async () => ({
        status: 'completed',
        summary: 'day 1 completed',
        usage: { tokensUsed: 300, apiCalls: 2, connectorActions: 0, runtimeMinutes: 20 },
      }),
    });
    expect(day1.report.completedTasks).toBe(1);
    expect(day1.plan.status).toBe('active');

    const day2 = await engine.executeDay({
      planId: plan.id,
      dayIndex: 1,
      taskExecutor: async ({ task }) => {
        if (task.title.includes('Day 2')) {
          return {
            status: 'failed',
            summary: 'upstream source missing',
            usage: { tokensUsed: 250, apiCalls: 1, connectorActions: 1, runtimeMinutes: 15 },
          };
        }
        return {
          status: 'completed',
          summary: 'completed',
          usage: { tokensUsed: 100, apiCalls: 1, connectorActions: 0, runtimeMinutes: 10 },
        };
      },
    });
    expect(day2.report.failedTasks).toBe(1);
    expect(day2.report.adaptations.length).toBeGreaterThan(0);

    const recovered = day2.plan.tasks.some(
      (task) => task.dayIndex === 2 && task.title.toLowerCase().includes('recovery loop')
    );
    expect(recovered).toBe(true);

    const day3 = await engine.executeDay({
      planId: plan.id,
      dayIndex: 2,
      taskExecutor: async () => ({
        status: 'completed',
        summary: 'recovered',
        usage: { tokensUsed: 220, apiCalls: 2, connectorActions: 0, runtimeMinutes: 25 },
      }),
    });
    expect(day3.report.completedTasks).toBeGreaterThan(0);
  });

  it('pauses for irreversible actions and resumes after approval', async () => {
    const guardrails = new AutonomyGuardrails({
      nowIso: () => '2026-03-01T09:00:00.000Z',
    });
    const engine = new PlanEngine({
      guardrails,
      nowIso: () => '2026-03-01T09:00:00.000Z',
    });

    const plan = engine.createPlan({
      userId: 'user-2',
      workspaceId: 'workspace-2',
      goal: 'Rotate production credentials',
      durationDays: 1,
      seedTasksByDay: [
        [
          {
            title: 'Rotate secrets',
            description: 'Write new credentials to key vault.',
            isIrreversible: true,
          },
        ],
      ],
    });

    const firstRun = await engine.executeDay({
      planId: plan.id,
      dayIndex: 0,
      taskExecutor: async () => ({
        status: 'completed',
        summary: 'rotation done',
      }),
    });

    expect(firstRun.plan.status).toBe('paused');
    expect(firstRun.report.blockedTasks).toBe(1);

    const escalation = guardrails.listEscalations({ planId: plan.id, status: 'pending' })[0];
    guardrails.resolveEscalation({
      escalationId: escalation.id,
      decision: 'approve',
      reviewerUserId: 'owner-2',
      nowIso: '2026-03-01T09:20:00.000Z',
    });

    const secondRun = await engine.executeDay({
      planId: plan.id,
      dayIndex: 0,
      taskExecutor: async () => ({
        status: 'completed',
        summary: 'rotation done',
        usage: { tokensUsed: 80, apiCalls: 1, connectorActions: 1, runtimeMinutes: 5 },
      }),
    });

    expect(secondRun.plan.status).toBe('completed');
    expect(secondRun.report.completedTasks).toBe(1);
  });
});
