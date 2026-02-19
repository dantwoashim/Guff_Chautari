export interface WatchSnapshot {
  pendingCheckpointCount: number;
  pendingNotificationCount: number;
  canCaptureVoiceNote: boolean;
}

export const buildWatchSnapshot = (payload: {
  pendingCheckpointCount: number;
  pendingNotificationCount: number;
  permissions: {
    microphone: boolean;
  };
}): WatchSnapshot => ({
  pendingCheckpointCount: Math.max(0, Math.floor(payload.pendingCheckpointCount)),
  pendingNotificationCount: Math.max(0, Math.floor(payload.pendingNotificationCount)),
  canCaptureVoiceNote: payload.permissions.microphone,
});
