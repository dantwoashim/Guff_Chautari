import type { GoalEvolution, GoalEvolutionStage, GoalLifecycleStatus } from './types';

export interface GoalTrackerActivityEvent {
  id: string;
  eventType: string;
  title: string;
  description: string;
  createdAtIso: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface GoalTrackerDecisionEvent {
  id: string;
  question: string;
  selectedOptionTitle?: string;
  createdAtIso: string;
}

interface GoalTrackerInput {
  userId: string;
  activityEvents?: ReadonlyArray<GoalTrackerActivityEvent>;
  decisionEvents?: ReadonlyArray<GoalTrackerDecisionEvent>;
}

interface GoalSignal {
  goalId: string;
  goalTitle: string;
  status: GoalLifecycleStatus;
  atIso: string;
  reason: string;
  sourceEventId: string;
}

const toMs = (iso: string): number => {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const normalize = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const slug = (value: string): string => normalize(value).replace(/\s+/g, '-').slice(0, 80);

const inferGoalStatus = (eventType: string, title: string, description: string): GoalLifecycleStatus | null => {
  const signal = `${eventType} ${title} ${description}`.toLowerCase();

  if (/goal\.created|outcome\.goal_created|goal created|created goal/.test(signal)) return 'created';
  if (/goal\.active|goal activated|activate goal|workflow\.created/.test(signal)) return 'active';
  if (/goal\.progress|outcome\.check_in|workflow\.completed|progress/.test(signal)) return 'progressing';
  if (/goal\.achieved|milestone completed|achieved|completed goal/.test(signal)) return 'achieved';
  if (/goal\.abandoned|abandon|drop goal|cancel/.test(signal)) return 'abandoned';
  if (/goal\.pivoted|pivot/.test(signal)) return 'pivoted';

  return null;
};

const inferGoalTitle = (event: GoalTrackerActivityEvent): string | null => {
  const fromMetadata = event.metadata?.goal_title;
  if (typeof fromMetadata === 'string' && fromMetadata.trim()) return fromMetadata.trim();

  const titleText = `${event.title} ${event.description}`;
  const explicit = titleText.match(/goal\s*[:\-]\s*([a-z0-9\s-]{3,80})/i);
  if (explicit?.[1]) return explicit[1].trim();

  if (/goal|milestone|outcome/.test(titleText.toLowerCase())) {
    return event.title.trim() || 'goal';
  }

  return null;
};

const activitySignals = (events: ReadonlyArray<GoalTrackerActivityEvent>): GoalSignal[] => {
  return events
    .map((event) => {
      const status = inferGoalStatus(event.eventType, event.title, event.description);
      if (!status) return null;

      const goalTitle = inferGoalTitle(event);
      if (!goalTitle) return null;

      const goalId =
        (typeof event.metadata?.goal_id === 'string' && event.metadata.goal_id.trim()) ||
        `goal-${slug(goalTitle)}`;

      return {
        goalId,
        goalTitle,
        status,
        atIso: event.createdAtIso,
        reason: `${event.title}: ${event.description}`.trim(),
        sourceEventId: event.id,
      } satisfies GoalSignal;
    })
    .filter((signal): signal is GoalSignal => signal !== null);
};

const decisionSignals = (events: ReadonlyArray<GoalTrackerDecisionEvent>): GoalSignal[] => {
  return events
    .map((event) => {
      const signalText = `${event.question} ${event.selectedOptionTitle ?? ''}`;
      const normalized = signalText.toLowerCase();
      if (!/goal|milestone|outcome|plan|roadmap/.test(normalized)) return null;

      const status: GoalLifecycleStatus = /pivot/.test(normalized)
        ? 'pivoted'
        : /complete|achieve|ship/.test(normalized)
          ? 'achieved'
          : 'progressing';

      const titleMatch = signalText.match(/(?:goal|outcome|plan)\s*[:\-]?\s*([a-z0-9\s-]{3,80})/i);
      const goalTitle = titleMatch?.[1]?.trim() || event.question.trim();

    return {
        goalId: `goal-${slug(goalTitle)}`,
        goalTitle,
        status,
        atIso: event.createdAtIso,
        reason: `Decision signal: ${signalText}`,
        sourceEventId: event.id,
      } satisfies GoalSignal;
    })
    .filter((signal): signal is NonNullable<typeof signal> => signal !== null);
};

const createStage = (
  status: GoalLifecycleStatus,
  atIso: string,
  reason: string,
  sourceEventId: string
): GoalEvolutionStage => ({
  status,
  atIso,
  reason,
  sourceEventId,
});

const createGoal = (payload: {
  userId: string;
  goalId: string;
  title: string;
  firstSignal: GoalSignal;
}): GoalEvolution => {
  const seedStage =
    payload.firstSignal.status === 'created'
      ? createStage('created', payload.firstSignal.atIso, payload.firstSignal.reason, payload.firstSignal.sourceEventId)
      : createStage('created', payload.firstSignal.atIso, 'Inferred goal creation from first signal.', payload.firstSignal.sourceEventId);

  const history: GoalEvolutionStage[] = [seedStage];
  let currentStatus: GoalLifecycleStatus = 'created';
  let pivotCount = 0;

  if (payload.firstSignal.status !== 'created') {
    history.push(
      createStage(
        payload.firstSignal.status,
        payload.firstSignal.atIso,
        payload.firstSignal.reason,
        payload.firstSignal.sourceEventId
      )
    );
    currentStatus = payload.firstSignal.status;
    if (payload.firstSignal.status === 'pivoted') pivotCount = 1;
  }

  return {
    goalId: payload.goalId,
    userId: payload.userId,
    title: payload.title,
    createdAtIso: payload.firstSignal.atIso,
    updatedAtIso: payload.firstSignal.atIso,
    currentStatus,
    pivotCount,
    history,
    relatedEventIds: [payload.firstSignal.sourceEventId],
  };
};

export const trackGoalEvolution = (payload: GoalTrackerInput): GoalEvolution[] => {
  const signals = [...activitySignals(payload.activityEvents ?? []), ...decisionSignals(payload.decisionEvents ?? [])].sort(
    (left, right) => toMs(left.atIso) - toMs(right.atIso)
  );

  const goals = new Map<string, GoalEvolution>();

  for (const signal of signals) {
    const existing = goals.get(signal.goalId);
    if (!existing) {
      goals.set(
        signal.goalId,
        createGoal({
          userId: payload.userId,
          goalId: signal.goalId,
          title: signal.goalTitle,
          firstSignal: signal,
        })
      );
      continue;
    }

    const lastStage = existing.history[existing.history.length - 1];
    existing.relatedEventIds.push(signal.sourceEventId);
    existing.updatedAtIso = signal.atIso;

    if (!lastStage || lastStage.status !== signal.status) {
      existing.history.push(createStage(signal.status, signal.atIso, signal.reason, signal.sourceEventId));
      existing.currentStatus = signal.status;
      if (signal.status === 'pivoted') existing.pivotCount += 1;
    } else if (signal.status === 'pivoted') {
      existing.pivotCount += 1;
    }

    goals.set(signal.goalId, existing);
  }

  return Array.from(goals.values()).sort((left, right) => toMs(left.createdAtIso) - toMs(right.createdAtIso));
};
