export type SyncEntityType = 'message' | 'knowledge' | 'workflow';

export interface SyncOperation {
  id: string;
  entityType: SyncEntityType;
  entityId: string;
  workspaceId: string;
  operation: 'create' | 'update' | 'delete';
  payload: Record<string, unknown>;
  queuedAtIso: string;
  attemptCount: number;
}

export interface SyncResult {
  operationId: string;
  status: 'synced' | 'retry' | 'failed';
  reason?: string;
}

export interface BatteryTelemetry {
  batteryPct: number;
  isCharging: boolean;
  lowPowerMode: boolean;
}

export interface SyncSchedulerWindow {
  minIntervalMs: number;
  maxBatchSize: number;
}

export type ConflictPolicy = 'last_write_wins_metadata' | 'merge_conversation_events';

export interface ConflictResolutionInput {
  policy: ConflictPolicy;
  localPayload: Record<string, unknown>;
  remotePayload: Record<string, unknown>;
  localUpdatedAtIso: string;
  remoteUpdatedAtIso: string;
}
