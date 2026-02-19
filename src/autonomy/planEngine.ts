import {
  autonomyGuardrails,
  AutonomyGuardrails,
} from './guardrails';
import type {
  AutonomousPlan,
  AutonomousPlanStatus,
  AutonomousTask,
  AutonomyGuardrailPolicy,
  AutonomyUsage,
  CreateAutonomousPlanInput,
  DailyProgressReport,
  ExecuteDayResult,
} from './types';

interface PlanEngineOptions {
  guardrails?: AutonomyGuardrails;
  nowIso?: () => string;
}

interface TaskExecutionResult {
  status: 'completed' | 'failed';
  summary?: string;
  usage?: Partial<AutonomyUsage>;
}

interface ExecuteDayInput {
  planId: string;
  dayIndex?: number;
  taskExecutor?: (payload: {
    plan: AutonomousPlan;
    task: AutonomousTask;
    dayIndex: number;
  }) => Promise<TaskExecutionResult> | TaskExecutionResult;
  nowIso?: string;
}

const defaultPolicy: AutonomyGuardrailPolicy = {
  escalationThresholdPct: 0.8,
  resourceBudget: {
    maxTokens: 120_000,
    maxApiCalls: 200,
    maxConnectorActions: 50,
    maxRuntimeHours: 6,
  },
};

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

const emptyUsage = (): AutonomyUsage => ({
  tokensUsed: 0,
  apiCalls: 0,
  connectorActions: 0,
  runtimeMinutes: 0,
});

const mergeUsage = (left: AutonomyUsage, right: Partial<AutonomyUsage>): AutonomyUsage => ({
  tokensUsed: Math.max(0, left.tokensUsed + Math.max(0, right.tokensUsed ?? 0)),
  apiCalls: Math.max(0, left.apiCalls + Math.max(0, right.apiCalls ?? 0)),
  connectorActions: Math.max(0, left.connectorActions + Math.max(0, right.connectorActions ?? 0)),
  runtimeMinutes: Math.max(0, left.runtimeMinutes + Math.max(0, right.runtimeMinutes ?? 0)),
});

const toIso = (value?: string): string => {
  if (!value) return new Date().toISOString();
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return new Date().toISOString();
  return new Date(parsed).toISOString();
};

const clonePlan = (plan: AutonomousPlan): AutonomousPlan => ({
  ...plan,
  tasks: plan.tasks.map((task) => ({ ...task })),
  usage: { ...plan.usage },
  reports: plan.reports.map((report) => ({ ...report, adaptations: [...report.adaptations], nextSteps: [...report.nextSteps] })),
  history: [...plan.history],
});

const defaultTaskTitle = (goal: string, dayIndex: number, durationDays: number): string => {
  if (dayIndex === 0) return `Clarify constraints for ${goal}`;
  if (dayIndex === durationDays - 1) return `Synthesize outcomes for ${goal}`;
  return `Execute milestone ${dayIndex + 1} for ${goal}`;
};

const defaultTaskDescription = (goal: string, dayIndex: number, durationDays: number): string => {
  if (dayIndex === 0) {
    return `Define concrete success criteria, dependencies, and risk boundaries for "${goal}".`;
  }
  if (dayIndex === durationDays - 1) {
    return `Review progress, consolidate outputs, and prepare next-week continuation for "${goal}".`;
  }
  return `Advance the daily milestone for "${goal}" and capture measurable output.`;
};

export class PlanEngine {
  private readonly plans = new Map<string, AutonomousPlan>();
  private readonly guardrails: AutonomyGuardrails;
  private readonly nowIso: () => string;

  constructor(options: PlanEngineOptions = {}) {
    this.guardrails = options.guardrails ?? autonomyGuardrails;
    this.nowIso = options.nowIso ?? (() => new Date().toISOString());
  }

  createPlan(
    input: CreateAutonomousPlanInput & {
      policy?: AutonomyGuardrailPolicy;
    }
  ): AutonomousPlan {
    const nowIso = toIso(input.nowIso ?? this.nowIso());
    const durationDays = Math.max(1, Math.min(30, Math.round(input.durationDays)));
    const planId = makeId('autonomy-plan');
    const tasks: AutonomousTask[] = [];

    for (let dayIndex = 0; dayIndex < durationDays; dayIndex += 1) {
      const seedTasks = input.seedTasksByDay?.[dayIndex] ?? [];
      if (seedTasks.length > 0) {
        for (const seed of seedTasks) {
          tasks.push({
            id: makeId('autonomy-task'),
            planId,
            dayIndex,
            title: seed.title,
            description: seed.description,
            status: 'pending',
            isIrreversible: seed.isIrreversible,
            estimatedTokens: seed.estimatedTokens ?? 1200,
            estimatedApiCalls: seed.estimatedApiCalls ?? 1,
            estimatedConnectorActions: seed.estimatedConnectorActions ?? 0,
            createdAtIso: nowIso,
            updatedAtIso: nowIso,
            notes: seed.notes,
          });
        }
        continue;
      }

      tasks.push({
        id: makeId('autonomy-task'),
        planId,
        dayIndex,
        title: defaultTaskTitle(input.goal, dayIndex, durationDays),
        description: defaultTaskDescription(input.goal, dayIndex, durationDays),
        status: 'pending',
        estimatedTokens: 1800,
        estimatedApiCalls: 2,
        estimatedConnectorActions: 1,
        createdAtIso: nowIso,
        updatedAtIso: nowIso,
      });
    }

    const plan: AutonomousPlan = {
      id: planId,
      userId: input.userId,
      workspaceId: input.workspaceId,
      goal: input.goal,
      status: 'active',
      durationDays,
      currentDayIndex: 0,
      tasks,
      usage: emptyUsage(),
      reports: [],
      history: [`Plan created with ${durationDays} day(s).`],
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };

    this.plans.set(plan.id, plan);
    this.guardrails.registerPlan({
      planId: plan.id,
      policy: input.policy ?? defaultPolicy,
      nowIso,
    });
    return clonePlan(plan);
  }

  getPlan(planId: string): AutonomousPlan | null {
    const plan = this.plans.get(planId);
    return plan ? clonePlan(plan) : null;
  }

  listPlans(payload?: {
    userId?: string;
    workspaceId?: string;
    statuses?: ReadonlyArray<AutonomousPlanStatus>;
  }): AutonomousPlan[] {
    return [...this.plans.values()]
      .filter((plan) => (payload?.userId ? plan.userId === payload.userId : true))
      .filter((plan) => (payload?.workspaceId ? plan.workspaceId === payload.workspaceId : true))
      .filter((plan) =>
        payload?.statuses && payload.statuses.length > 0
          ? payload.statuses.includes(plan.status)
          : true
      )
      .sort((left, right) => Date.parse(right.updatedAtIso) - Date.parse(left.updatedAtIso))
      .map((plan) => clonePlan(plan));
  }

  async executeDay(input: ExecuteDayInput): Promise<ExecuteDayResult> {
    const nowIso = toIso(input.nowIso ?? this.nowIso());
    const plan = this.plans.get(input.planId);
    if (!plan) {
      throw new Error(`Autonomous plan ${input.planId} not found.`);
    }

    if (this.guardrails.isKillSwitchActive()) {
      plan.status = 'halted';
      plan.updatedAtIso = nowIso;
      plan.history.push('Kill switch active. Execution halted.');
      const haltedReport = this.createReport({
        plan,
        dayIndex: input.dayIndex ?? plan.currentDayIndex,
        completedTasks: 0,
        failedTasks: 0,
        blockedTasks: 0,
        summary: 'Execution blocked by kill switch.',
        adaptations: [],
        nextSteps: [],
        nowIso,
      });
      plan.reports.unshift(haltedReport);
      this.plans.set(plan.id, plan);
      return {
        plan: clonePlan(plan),
        dayIndex: haltedReport.dayIndex,
        report: { ...haltedReport },
      };
    }

    if (plan.status === 'completed' || plan.status === 'halted') {
      throw new Error(`Plan ${plan.id} is ${plan.status} and cannot execute additional days.`);
    }

    if (plan.status === 'paused' && !this.guardrails.isPlanPaused(plan.id)) {
      plan.status = 'active';
    }

    const dayIndex = Math.max(0, Math.min(plan.durationDays - 1, input.dayIndex ?? plan.currentDayIndex));
    const tasks = plan.tasks.filter((task) => task.dayIndex === dayIndex);
    let completedTasks = 0;
    let failedTasks = 0;
    let blockedTasks = 0;
    const adaptations: string[] = [];
    const executor =
      input.taskExecutor ??
      (async ({ task }) => ({
        status: 'completed' as const,
        summary: `Auto-executed ${task.title}`,
        usage: {
          tokensUsed: task.estimatedTokens ?? 0,
          apiCalls: task.estimatedApiCalls ?? 0,
          connectorActions: task.estimatedConnectorActions ?? 0,
          runtimeMinutes: 20,
        },
      }));

    for (const task of tasks) {
      if (task.status === 'completed' || task.status === 'skipped') {
        completedTasks += 1;
        continue;
      }

      const guardrailCheck = this.guardrails.evaluateAction({
        planId: plan.id,
        actionId: task.id,
        irreversible: task.isIrreversible,
        estimatedUsage: {
          tokensUsed: task.estimatedTokens ?? 0,
          apiCalls: task.estimatedApiCalls ?? 0,
          connectorActions: task.estimatedConnectorActions ?? 0,
          runtimeMinutes: 20,
        },
        nowIso,
      });
      if (!guardrailCheck.allow) {
        task.status = 'approval_required';
        task.updatedAtIso = nowIso;
        task.notes = guardrailCheck.escalation?.reason || 'Blocked by guardrail.';
        blockedTasks += 1;
        plan.status = 'paused';
        plan.updatedAtIso = nowIso;
        plan.history.push(`Execution paused at day ${dayIndex + 1}: ${task.notes}`);
        break;
      }

      task.status = 'running';
      task.updatedAtIso = nowIso;

      try {
        const result = await executor({
          plan: clonePlan(plan),
          task: { ...task },
          dayIndex,
        });

        if (result.status === 'failed') {
          task.status = 'failed';
          task.notes = result.summary || 'Task execution failed.';
          failedTasks += 1;
          this.addCompensatingTask({
            plan,
            fromDayIndex: dayIndex,
            nowIso,
          });
          adaptations.push(`Added compensating task after failure in "${task.title}".`);
        } else {
          task.status = 'completed';
          task.notes = result.summary;
          completedTasks += 1;
        }

        const usageDelta = result.usage ?? {
          tokensUsed: task.estimatedTokens ?? 0,
          apiCalls: task.estimatedApiCalls ?? 0,
          connectorActions: task.estimatedConnectorActions ?? 0,
          runtimeMinutes: 20,
        };
        plan.usage = mergeUsage(plan.usage, usageDelta);
        this.guardrails.recordUsage(plan.id, usageDelta);
      } catch (error) {
        task.status = 'failed';
        task.notes = error instanceof Error ? error.message : String(error);
        failedTasks += 1;
        this.addCompensatingTask({
          plan,
          fromDayIndex: dayIndex,
          nowIso,
        });
        adaptations.push(`Added compensating task after runtime failure in "${task.title}".`);
      } finally {
        task.updatedAtIso = nowIso;
      }
    }

    if (plan.status !== 'paused') {
      const hasOpenTasks = plan.tasks.some(
        (task) => task.status === 'pending' || task.status === 'running' || task.status === 'approval_required'
      );
      if (hasOpenTasks) {
        plan.status = 'active';
      } else if (failedTasks > 0) {
        plan.status = 'failed';
      } else {
        plan.status = 'completed';
      }
    }

    if (plan.status === 'active') {
      const nextOpenDay = plan.tasks
        .filter((task) => task.status === 'pending' || task.status === 'approval_required')
        .map((task) => task.dayIndex)
        .sort((left, right) => left - right)[0];
      plan.currentDayIndex = nextOpenDay ?? Math.min(plan.durationDays - 1, dayIndex + 1);
    }

    plan.updatedAtIso = nowIso;
    const nextSteps = plan.tasks
      .filter((task) => task.dayIndex >= dayIndex && task.status === 'pending')
      .slice(0, 3)
      .map((task) => task.title);
    const report = this.createReport({
      plan,
      dayIndex,
      completedTasks,
      failedTasks,
      blockedTasks,
      summary:
        plan.status === 'paused'
          ? 'Execution paused for guardrail review.'
          : `Executed day ${dayIndex + 1}. Completed ${completedTasks}, failed ${failedTasks}, blocked ${blockedTasks}.`,
      adaptations,
      nextSteps,
      nowIso,
    });
    plan.reports.unshift(report);
    plan.history.push(report.summary);
    this.plans.set(plan.id, plan);

    return {
      plan: clonePlan(plan),
      dayIndex,
      report: { ...report, adaptations: [...report.adaptations], nextSteps: [...report.nextSteps] },
    };
  }

  resumePlan(planId: string): AutonomousPlan {
    const plan = this.plans.get(planId);
    if (!plan) {
      throw new Error(`Autonomous plan ${planId} not found.`);
    }
    if (this.guardrails.isKillSwitchActive()) {
      throw new Error('Kill switch is active. Clear kill switch before resuming.');
    }
    if (this.guardrails.isPlanPaused(planId)) {
      plan.status = 'paused';
      plan.updatedAtIso = this.nowIso();
      this.plans.set(plan.id, plan);
      return clonePlan(plan);
    }
    plan.status = 'active';
    plan.updatedAtIso = this.nowIso();
    plan.history.push('Plan resumed.');
    this.plans.set(plan.id, plan);
    return clonePlan(plan);
  }

  haltPlan(planId: string, reason = 'manual halt'): AutonomousPlan {
    const plan = this.plans.get(planId);
    if (!plan) {
      throw new Error(`Autonomous plan ${planId} not found.`);
    }
    plan.status = 'halted';
    plan.updatedAtIso = this.nowIso();
    plan.history.push(`Plan halted: ${reason}`);
    this.plans.set(plan.id, plan);
    return clonePlan(plan);
  }

  private addCompensatingTask(payload: {
    plan: AutonomousPlan;
    fromDayIndex: number;
    nowIso: string;
  }): void {
    const nextDay = Math.min(payload.plan.durationDays - 1, payload.fromDayIndex + 1);
    const task: AutonomousTask = {
      id: makeId('autonomy-task'),
      planId: payload.plan.id,
      dayIndex: nextDay,
      title: `Recovery loop for day ${payload.fromDayIndex + 1}`,
      description:
        'Compensate for previous failure, restore baseline progress, and unblock downstream tasks.',
      status: 'pending',
      estimatedTokens: 1500,
      estimatedApiCalls: 2,
      estimatedConnectorActions: 1,
      createdAtIso: payload.nowIso,
      updatedAtIso: payload.nowIso,
    };
    payload.plan.tasks.push(task);
  }

  private createReport(payload: {
    plan: AutonomousPlan;
    dayIndex: number;
    completedTasks: number;
    failedTasks: number;
    blockedTasks: number;
    summary: string;
    adaptations: string[];
    nextSteps: string[];
    nowIso: string;
  }): DailyProgressReport {
    return {
      id: makeId('autonomy-report'),
      planId: payload.plan.id,
      dayIndex: payload.dayIndex,
      completedTasks: payload.completedTasks,
      failedTasks: payload.failedTasks,
      blockedTasks: payload.blockedTasks,
      summary: payload.summary,
      adaptations: payload.adaptations,
      nextSteps: payload.nextSteps,
      createdAtIso: payload.nowIso,
    };
  }
}

export const autonomyPlanEngine = new PlanEngine();
