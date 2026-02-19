export type AvailabilityMode = 'available' | 'busy' | 'away' | 'sleeping';

export interface DailyScheduleBlock {
  id: string;
  label: string;
  startHour: number;
  endHour: number;
  mode: AvailabilityMode;
  responseBias?: string;
}

export interface DailySchedule {
  personaType: 'default' | 'worker' | 'student' | 'night_owl';
  wakeHour: number;
  sleepHour: number;
  mealHours: number[];
  workHours: [number, number];
  leisureHours: [number, number];
  blocks: DailyScheduleBlock[];
}

export interface ScheduleState {
  hour: number;
  isWeekend: boolean;
  currentBlock: DailyScheduleBlock;
  minutesToNextBlock: number;
}

export interface EnergyCycle {
  baseline: number;
  circadianAmplitude: number;
  depletionPerTurn: number;
  recoveryPerHour: number;
  currentEnergy: number;
  lastUpdatedAt: number;
}

export interface AvailabilityWindow {
  available: boolean;
  mode: AvailabilityMode;
  reason: string;
  suggestedDelayMs: number;
}

export type LifeEventType = 'birthday' | 'holiday' | 'weekend' | 'custom';

export interface LifeEvent {
  id: string;
  title: string;
  dateIso: string;
  type: LifeEventType;
  moodShift: number;
  note?: string;
}

export interface TemporalContextSnapshot {
  schedule: ScheduleState;
  energyLevel: number;
  availability: AvailabilityWindow;
  activeEvents: LifeEvent[];
}
