import type { DailySchedule, DailyScheduleBlock, ScheduleState } from './types';

const clampHour = (value: number): number => {
  if (value < 0) return 0;
  if (value > 24) return 24;
  return value;
};

const createBlock = (
  id: string,
  label: string,
  startHour: number,
  endHour: number,
  mode: DailyScheduleBlock['mode'],
  responseBias?: string
): DailyScheduleBlock => {
  return {
    id,
    label,
    startHour: clampHour(startHour),
    endHour: clampHour(endHour),
    mode,
    responseBias,
  };
};

export const createTemporalSchedule = (
  personaType: DailySchedule['personaType'] = 'default'
): DailySchedule => {
  if (personaType === 'night_owl') {
    return {
      personaType,
      wakeHour: 10,
      sleepHour: 2,
      mealHours: [12, 19],
      workHours: [14, 21],
      leisureHours: [21, 1],
      blocks: [
        createBlock('sleep', 'Sleeping', 2, 10, 'sleeping', 'offline'),
        createBlock('warmup', 'Morning Warmup', 10, 13, 'available', 'slow'),
        createBlock('deep-work', 'Deep Work', 13, 20, 'busy', 'focused'),
        createBlock('social', 'Evening Social', 20, 24, 'available', 'engaged'),
        createBlock('night', 'Night Wind Down', 0, 2, 'away', 'minimal'),
      ],
    };
  }

  return {
    personaType,
    wakeHour: 7,
    sleepHour: 23,
    mealHours: [8, 13, 19],
    workHours: [9, 17],
    leisureHours: [18, 22],
    blocks: [
      createBlock('sleep', 'Sleeping', 0, 7, 'sleeping', 'offline'),
      createBlock('morning', 'Morning Routine', 7, 9, 'available', 'warmup'),
      createBlock('work', 'Focused Work', 9, 17, 'busy', 'focused'),
      createBlock('evening', 'Evening Window', 17, 22, 'available', 'social'),
      createBlock('wind-down', 'Wind Down', 22, 24, 'away', 'minimal'),
    ],
  };
};

const hourInBlock = (hour: number, block: DailyScheduleBlock): boolean => {
  if (block.startHour <= block.endHour) {
    return hour >= block.startHour && hour < block.endHour;
  }
  return hour >= block.startHour || hour < block.endHour;
};

const minutesUntil = (hour: number, minute: number, targetHour: number): number => {
  const nowMinutes = hour * 60 + minute;
  const targetMinutes = targetHour * 60;
  const diff = targetMinutes - nowMinutes;
  if (diff >= 0) return diff;
  return 24 * 60 + diff;
};

export const resolveScheduleState = (
  schedule: DailySchedule,
  timestamp: number
): ScheduleState => {
  const now = new Date(timestamp);
  const hour = now.getHours();
  const minute = now.getMinutes();
  const day = now.getDay();
  const isWeekend = day === 0 || day === 6;

  const currentBlock =
    schedule.blocks.find((block) => hourInBlock(hour, block)) ??
    schedule.blocks[schedule.blocks.length - 1];

  const minutesToNextBlock = minutesUntil(hour, minute, currentBlock.endHour % 24);

  return {
    hour,
    isWeekend,
    currentBlock,
    minutesToNextBlock,
  };
};
