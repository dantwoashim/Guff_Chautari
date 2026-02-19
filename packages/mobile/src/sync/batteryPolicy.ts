import type { BatteryTelemetry, SyncSchedulerWindow } from './types';

const LOW_BATTERY_THRESHOLD = 0.2;

export const resolveSyncWindow = (telemetry: BatteryTelemetry): SyncSchedulerWindow => {
  if (telemetry.lowPowerMode || (!telemetry.isCharging && telemetry.batteryPct <= LOW_BATTERY_THRESHOLD)) {
    return {
      minIntervalMs: 15_000,
      maxBatchSize: 2,
    };
  }

  if (!telemetry.isCharging && telemetry.batteryPct <= 0.45) {
    return {
      minIntervalMs: 7_500,
      maxBatchSize: 5,
    };
  }

  return {
    minIntervalMs: 3_000,
    maxBatchSize: 12,
  };
};
