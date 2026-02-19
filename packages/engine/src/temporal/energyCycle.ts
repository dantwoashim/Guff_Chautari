import type { EnergyCycle } from './types';

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

const circadianBase = (hour: number): number => {
  const radians = ((hour - 4) / 24) * Math.PI * 2;
  const normalized = (Math.sin(radians) + 1) / 2;
  return clamp(0.28 + normalized * 0.58, 0, 1);
};

export const initializeEnergyCycle = (timestamp: number): EnergyCycle => {
  const now = new Date(timestamp);
  return {
    baseline: 0.55,
    circadianAmplitude: 0.25,
    depletionPerTurn: 0.06,
    recoveryPerHour: 0.08,
    currentEnergy: circadianBase(now.getHours()),
    lastUpdatedAt: timestamp,
  };
};

export const recoverEnergy = (cycle: EnergyCycle, now: number): EnergyCycle => {
  const elapsedHours = Math.max(0, (now - cycle.lastUpdatedAt) / (60 * 60 * 1000));
  const recovered = cycle.currentEnergy + elapsedHours * cycle.recoveryPerHour;
  return {
    ...cycle,
    currentEnergy: clamp(recovered, 0, 1),
    lastUpdatedAt: now,
  };
};

export const applyConversationLoad = (
  cycle: EnergyCycle,
  turnCount: number,
  now: number
): EnergyCycle => {
  const recovered = recoverEnergy(cycle, now);
  const depleted = recovered.currentEnergy - Math.max(1, turnCount) * cycle.depletionPerTurn;
  return {
    ...recovered,
    currentEnergy: clamp(depleted, 0, 1),
    lastUpdatedAt: now,
  };
};

export const getEffectiveEnergy = (cycle: EnergyCycle, timestamp: number): number => {
  const hour = new Date(timestamp).getHours();
  const circadian = circadianBase(hour);
  const blended = cycle.currentEnergy * 0.7 + circadian * 0.3;
  return clamp(blended, 0, 1);
};
