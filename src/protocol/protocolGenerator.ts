import type {
  GenerateProtocolInput,
  PersonalProtocol,
  ProtocolActivity,
  ProtocolDay,
  ProtocolWeekday,
} from './types';

const WEEKDAYS: ProtocolWeekday[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

const formatTime = (hour: number, minute: number): string =>
  `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

const createBaseActivities = (payload: {
  weekday: ProtocolWeekday;
  valueTheme: string;
  goalTheme: string;
}): ProtocolActivity[] => {
  const weekdayLabel = payload.weekday[0].toUpperCase() + payload.weekday.slice(1);

  const morning: ProtocolActivity = {
    id: makeId('protocol-activity'),
    type: 'morning_routine',
    title: `${weekdayLabel} Prime`,
    description: `Anchor the day around ${payload.valueTheme} and clarify top 1-2 priorities.`,
    startTime: formatTime(7, 30),
    durationMinutes: 25,
    triggers: ['first_device_unlock', 'after_wakeup'],
    checkCriteria: ['Priority list written', 'Main risk acknowledged'],
  };

  const focus: ProtocolActivity = {
    id: makeId('protocol-activity'),
    type: 'focus_block',
    title: 'Deep Focus Block',
    description: `Run an uninterrupted block toward ${payload.goalTheme}.`,
    startTime: formatTime(9, 0),
    durationMinutes: 100,
    triggers: ['calendar_open_slot', 'after_morning_prime'],
    checkCriteria: ['No context switching', 'One measurable artifact shipped'],
    autonomousPlanHint: `Autonomously prepare support material for ${payload.goalTheme}.`,
  };

  const checkIn: ProtocolActivity = {
    id: makeId('protocol-activity'),
    type: 'check_in',
    title: 'Midday Check-in',
    description: 'Assess progress, energy, and blockers before afternoon work.',
    startTime: formatTime(13, 0),
    durationMinutes: 15,
    triggers: ['lunch_end', 'calendar_midday'],
    checkCriteria: ['Progress scored', 'One blocker documented'],
  };

  return [morning, focus, checkIn];
};

const createDaySpecificActivities = (payload: {
  weekday: ProtocolWeekday;
  valueTheme: string;
  goalTheme: string;
}): ProtocolActivity[] => {
  if (payload.weekday === 'saturday' || payload.weekday === 'sunday') {
    return [
      {
        id: makeId('protocol-activity'),
        type: 'recovery',
        title: 'Recovery + Learning Block',
        description: `Recharge deliberately while reinforcing ${payload.valueTheme}.`,
        startTime: formatTime(11, 0),
        durationMinutes: 60,
        triggers: ['weekend_morning'],
        checkCriteria: ['Recovery completed', 'Learning note captured'],
      },
    ];
  }

  if (payload.weekday === 'friday') {
    return [
      {
        id: makeId('protocol-activity'),
        type: 'review',
        title: 'Weekly Review',
        description: `Review wins, misses, and update next-week plan around ${payload.goalTheme}.`,
        startTime: formatTime(17, 0),
        durationMinutes: 45,
        triggers: ['end_of_workday'],
        checkCriteria: ['Wins captured', 'Misses analyzed', 'Next-week priorities drafted'],
      },
    ];
  }

  return [
    {
      id: makeId('protocol-activity'),
      type: 'decision_framework',
      title: 'Decision Window',
      description: `Apply explicit tradeoff framework before committing to new work.`,
      startTime: formatTime(16, 30),
      durationMinutes: 30,
      triggers: ['before_commitment', 'new_priority_detected'],
      checkCriteria: ['Tradeoff recorded', 'Downside plan written'],
    },
  ];
};

export const generatePersonalProtocol = (input: GenerateProtocolInput): PersonalProtocol => {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const valueTitles = input.values.map((value) => value.title);
  const primaryValue = valueTitles[0] ?? 'focus';
  const secondaryValue = valueTitles[1] ?? primaryValue;
  const goalTheme = input.goals[0] ?? 'core weekly outcome';

  const days: ProtocolDay[] = WEEKDAYS.map((weekday, index) => {
    const theme = index % 2 === 0 ? primaryValue : secondaryValue;
    const base = createBaseActivities({
      weekday,
      valueTheme: theme,
      goalTheme,
    });
    const specifics = createDaySpecificActivities({
      weekday,
      valueTheme: theme,
      goalTheme,
    });
    return {
      weekday,
      theme: `${theme} × ${goalTheme}`,
      activities: [...base, ...specifics],
    };
  });

  return {
    id: makeId('personal-protocol'),
    userId: input.userId,
    workspaceId: input.workspaceId,
    version: 1,
    values: [...input.values],
    goals: [...input.goals],
    days,
    generatedAtIso: nowIso,
  };
};
