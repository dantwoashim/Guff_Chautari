import type { SeasonalState } from './types';

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

export const computeSeasonalState = (turnCount: number): SeasonalState => {
  const safeTurns = Math.max(0, turnCount);

  let phase: SeasonalState['phase'];
  if (safeTurns < 25) {
    phase = 'honeymoon';
  } else if (safeTurns < 70) {
    phase = 'settling';
  } else {
    phase = 'mature';
  }

  const intensity = clamp(0.9 - safeTurns * 0.004 + (phase === 'honeymoon' ? 0.06 : 0), 0.45, 0.96);
  const comfort = clamp(0.28 + safeTurns * 0.006 + (phase === 'mature' ? 0.1 : 0), 0.2, 0.95);

  return {
    turnCount: safeTurns,
    phase,
    intensity,
    comfort,
  };
};

export const advanceSeasonalState = (
  current: SeasonalState,
  turnsToAdvance = 1
): SeasonalState => {
  return computeSeasonalState(current.turnCount + Math.max(1, turnsToAdvance));
};
