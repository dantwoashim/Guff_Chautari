import type { AvailabilityWindow, ScheduleState } from './types';

const clampDelay = (minutes: number): number => {
  const ms = minutes * 60 * 1000;
  return Math.max(0, ms);
};

export const computeAvailabilityWindow = (
  scheduleState: ScheduleState,
  energyLevel: number
): AvailabilityWindow => {
  const mode = scheduleState.currentBlock.mode;

  if (mode === 'sleeping') {
    return {
      available: false,
      mode,
      reason: 'Persona is sleeping.',
      suggestedDelayMs: clampDelay(Math.max(30, scheduleState.minutesToNextBlock)),
    };
  }

  if (mode === 'away') {
    return {
      available: false,
      mode,
      reason: 'Persona is in a wind-down or away window.',
      suggestedDelayMs: clampDelay(Math.max(8, Math.min(20, scheduleState.minutesToNextBlock))),
    };
  }

  if (mode === 'busy') {
    const busyDelayMinutes = energyLevel < 0.35 ? 12 : 6;
    return {
      available: false,
      mode,
      reason: 'Persona is in a focused work block.',
      suggestedDelayMs: clampDelay(busyDelayMinutes),
    };
  }

  if (energyLevel < 0.22) {
    return {
      available: false,
      mode: 'busy',
      reason: 'Energy is critically low; response should be delayed.',
      suggestedDelayMs: clampDelay(10),
    };
  }

  if (energyLevel < 0.4) {
    return {
      available: true,
      mode,
      reason: 'Available but low energy; use slower pacing.',
      suggestedDelayMs: clampDelay(2),
    };
  }

  return {
    available: true,
    mode,
    reason: 'Available now.',
    suggestedDelayMs: 0,
  };
};
