import type { ConflictResolutionInput } from './types';

const toMs = (iso: string): number => {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? 0 : parsed;
};

export const resolveSyncConflict = (input: ConflictResolutionInput): Record<string, unknown> => {
  if (input.policy === 'merge_conversation_events') {
    const localEvents = Array.isArray(input.localPayload.events) ? input.localPayload.events : [];
    const remoteEvents = Array.isArray(input.remotePayload.events) ? input.remotePayload.events : [];
    return {
      ...input.remotePayload,
      ...input.localPayload,
      events: [...remoteEvents, ...localEvents],
      mergedAtIso: new Date().toISOString(),
    };
  }

  if (toMs(input.localUpdatedAtIso) >= toMs(input.remoteUpdatedAtIso)) {
    return {
      ...input.remotePayload,
      ...input.localPayload,
    };
  }

  return {
    ...input.localPayload,
    ...input.remotePayload,
  };
};
