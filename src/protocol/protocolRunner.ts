import { emitActivityEvent } from '../activity';
import { workflowEngine, type WorkflowEngine } from '../workflows';
import type {
  AdherenceStatus,
  ExecuteProtocolDayInput,
  PersonalProtocol,
  ProtocolActivation,
  ProtocolAdherenceRecord,
  ProtocolExecutionReport,
  ProtocolWeekday,
} from './types';

interface ProtocolRunnerOptions {
  workflowEngine?: Pick<WorkflowEngine, 'createFromPrompt'>;
  nowIso?: () => string;
}

interface ActivateProtocolInput {
  workspaceId: string;
  userId: string;
  protocol: PersonalProtocol;
}

export type ProtocolAutonomyExecutor = (payload: {
  workspaceId: string;
  userId: string;
  protocol: PersonalProtocol;
  dateIso: string;
  weekday: ProtocolWeekday;
  activityId: string;
  activityTitle: string;
  prompt: string;
}) => Promise<{ planId: string } | null> | { planId: string } | null;

export type ProtocolOutcomeNotifier = (payload: {
  workspaceId: string;
  userId: string;
  protocolId: string;
  dateIso: string;
  adherenceRate: number;
  completed: number;
  partial: number;
  missed: number;
}) => void;

const WEEKDAY_BY_INDEX: ProtocolWeekday[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

const parseWeekday = (dateIso: string): ProtocolWeekday => {
  const day = new Date(dateIso).getUTCDay();
  return WEEKDAY_BY_INDEX[day] ?? 'monday';
};

const statusScore = (status: AdherenceStatus): number => {
  if (status === 'completed') return 1;
  if (status === 'partial') return 0.5;
  return 0;
};

const parseTime = (value: string): { hour: number; minute: number } => {
  const [hourRaw, minuteRaw] = value.split(':');
  const hour = Number.parseInt(hourRaw, 10);
  const minute = Number.parseInt(minuteRaw, 10);
  return {
    hour: Number.isFinite(hour) ? hour : 8,
    minute: Number.isFinite(minute) ? minute : 0,
  };
};

const formatTime = (hour: number, minute: number): string =>
  `${String(Math.max(0, Math.min(23, hour))).padStart(2, '0')}:${String(
    Math.max(0, Math.min(59, minute))
  ).padStart(2, '0')}`;

const shiftTime = (time: string, minutesDelta: number): string => {
  const { hour, minute } = parseTime(time);
  const total = hour * 60 + minute + minutesDelta;
  const wrapped = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const nextHour = Math.floor(wrapped / 60);
  const nextMinute = wrapped % 60;
  return formatTime(nextHour, nextMinute);
};

export class ProtocolRunner {
  private readonly activeProtocolByWorkspace = new Map<string, PersonalProtocol>();
  private readonly activationByWorkspace = new Map<string, ProtocolActivation>();
  private readonly adherenceByProtocolId = new Map<string, ProtocolAdherenceRecord[]>();
  private readonly workflowEngine: Pick<WorkflowEngine, 'createFromPrompt'>;
  private readonly nowIso: () => string;

  constructor(options: ProtocolRunnerOptions = {}) {
    this.workflowEngine = options.workflowEngine ?? workflowEngine;
    this.nowIso = options.nowIso ?? (() => new Date().toISOString());
  }

  activateProtocol(input: ActivateProtocolInput): ProtocolActivation {
    const protocol = this.cloneProtocol(input.protocol);
    const createdWorkflowIds: string[] = [];
    const scheduledCheckInIds: string[] = [];

    for (const day of protocol.days) {
      for (const activity of day.activities) {
        const workflow = this.workflowEngine.createFromPrompt({
          userId: input.userId,
          prompt: `[Protocol:${protocol.id}] ${day.weekday} ${activity.title}: ${activity.description}`,
        });
        createdWorkflowIds.push(workflow.id);

        if (activity.type === 'check_in') {
          scheduledCheckInIds.push(`${protocol.id}:${day.weekday}:${activity.id}`);
        }
      }
    }

    const activation: ProtocolActivation = {
      workspaceId: input.workspaceId,
      protocolId: protocol.id,
      createdWorkflowIds,
      scheduledCheckInIds,
      activatedAtIso: this.nowIso(),
    };

    this.activeProtocolByWorkspace.set(input.workspaceId, protocol);
    this.activationByWorkspace.set(input.workspaceId, activation);
    if (!this.adherenceByProtocolId.has(protocol.id)) {
      this.adherenceByProtocolId.set(protocol.id, []);
    }

    emitActivityEvent({
      userId: input.userId,
      category: 'workflow',
      eventType: 'protocol.activated',
      title: 'Personal protocol activated',
      description: `Activated protocol with ${createdWorkflowIds.length} workflow templates.`,
      metadata: {
        protocolId: protocol.id,
      },
    });

    return activation;
  }

  getActiveProtocol(workspaceId: string): PersonalProtocol | null {
    const protocol = this.activeProtocolByWorkspace.get(workspaceId);
    return protocol ? this.cloneProtocol(protocol) : null;
  }

  getActivation(workspaceId: string): ProtocolActivation | null {
    const activation = this.activationByWorkspace.get(workspaceId);
    return activation ? { ...activation, createdWorkflowIds: [...activation.createdWorkflowIds], scheduledCheckInIds: [...activation.scheduledCheckInIds] } : null;
  }

  listAdherence(payload: { protocolId: string; limit?: number }): ProtocolAdherenceRecord[] {
    const rows = this.adherenceByProtocolId.get(payload.protocolId) ?? [];
    return [...rows]
      .sort((left, right) => Date.parse(right.createdAtIso) - Date.parse(left.createdAtIso))
      .slice(0, payload.limit ?? rows.length);
  }

  async executeDay(
    input: ExecuteProtocolDayInput & {
      autonomyExecutor?: ProtocolAutonomyExecutor;
      outcomeNotifier?: ProtocolOutcomeNotifier;
    }
  ): Promise<ProtocolExecutionReport> {
    const protocol = this.activeProtocolByWorkspace.get(input.workspaceId);
    if (!protocol) {
      throw new Error(`No active protocol for workspace ${input.workspaceId}.`);
    }

    const weekday = parseWeekday(input.dateIso);
    const day = protocol.days.find((entry) => entry.weekday === weekday);
    if (!day) {
      throw new Error(`Protocol day not found for ${weekday}.`);
    }

    const records = this.adherenceByProtocolId.get(protocol.id) ?? [];
    const createdAtIso = this.nowIso();
    let completed = 0;
    let partial = 0;
    let missed = 0;
    let scoreTotal = 0;
    const generatedAutonomousPlanIds: string[] = [];

    for (const activity of day.activities) {
      const status = input.adherenceByActivityId?.[activity.id] ?? 'completed';
      const score = statusScore(status);
      scoreTotal += score;
      if (status === 'completed') completed += 1;
      if (status === 'partial') partial += 1;
      if (status === 'missed') missed += 1;

      const record: ProtocolAdherenceRecord = {
        id: makeId('protocol-adherence'),
        protocolId: protocol.id,
        workspaceId: input.workspaceId,
        userId: input.userId,
        dateIso: input.dateIso,
        weekday,
        activityId: activity.id,
        status,
        score,
        createdAtIso,
      };
      records.push(record);

      if (activity.autonomousPlanHint && status !== 'missed' && input.autonomyExecutor) {
        const created = await input.autonomyExecutor({
          workspaceId: input.workspaceId,
          userId: input.userId,
          protocol,
          dateIso: input.dateIso,
          weekday,
          activityId: activity.id,
          activityTitle: activity.title,
          prompt: activity.autonomousPlanHint,
        });
        if (created?.planId) {
          generatedAutonomousPlanIds.push(created.planId);
        }
      }
    }

    this.adherenceByProtocolId.set(protocol.id, records);
    const adherenceRate = day.activities.length === 0 ? 0 : scoreTotal / day.activities.length;
    this.applyAdaptiveTuning(protocol, weekday, adherenceRate);
    this.activeProtocolByWorkspace.set(input.workspaceId, protocol);

    emitActivityEvent({
      userId: input.userId,
      category: 'outcome',
      eventType: 'protocol.adherence_updated',
      title: 'Protocol adherence updated',
      description: `Adherence ${Math.round(adherenceRate * 100)}% for ${weekday}.`,
      metadata: {
        protocolId: protocol.id,
        adherenceRate: Number(adherenceRate.toFixed(4)),
      },
    });

    input.outcomeNotifier?.({
      workspaceId: input.workspaceId,
      userId: input.userId,
      protocolId: protocol.id,
      dateIso: input.dateIso,
      adherenceRate,
      completed,
      partial,
      missed,
    });

    return {
      protocolId: protocol.id,
      workspaceId: input.workspaceId,
      weekday,
      dateIso: input.dateIso,
      adherenceRate: Number(adherenceRate.toFixed(4)),
      completed,
      partial,
      missed,
      generatedAutonomousPlanIds,
    };
  }

  private applyAdaptiveTuning(
    protocol: PersonalProtocol,
    weekday: ProtocolWeekday,
    adherenceRate: number
  ): void {
    const currentIndex = protocol.days.findIndex((day) => day.weekday === weekday);
    if (currentIndex < 0) return;
    const nextDay = protocol.days[(currentIndex + 1) % protocol.days.length];
    if (!nextDay) return;

    if (adherenceRate < 0.6) {
      nextDay.activities = nextDay.activities.map((activity) => ({
        ...activity,
        durationMinutes: Math.max(10, Math.round(activity.durationMinutes * 0.85)),
        startTime: shiftTime(activity.startTime, 30),
      }));
      return;
    }

    if (adherenceRate > 0.85) {
      nextDay.activities = nextDay.activities.map((activity) => {
        if (activity.type !== 'focus_block') return activity;
        return {
          ...activity,
          durationMinutes: Math.min(180, Math.round(activity.durationMinutes * 1.1)),
          startTime: shiftTime(activity.startTime, -10),
        };
      });
    }
  }

  private cloneProtocol(protocol: PersonalProtocol): PersonalProtocol {
    return {
      ...protocol,
      values: protocol.values.map((value) => ({ ...value, evidence: [...value.evidence] })),
      goals: [...protocol.goals],
      days: protocol.days.map((day) => ({
        ...day,
        activities: day.activities.map((activity) => ({
          ...activity,
          triggers: [...activity.triggers],
          checkCriteria: [...activity.checkCriteria],
        })),
      })),
    };
  }
}

export const protocolRunner = new ProtocolRunner();
