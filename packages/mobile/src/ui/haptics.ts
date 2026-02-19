export type HapticEvent = 'message_sent' | 'checkpoint_approved' | 'outcome_achieved';

export interface HapticPattern {
  event: HapticEvent;
  intensity: 'light' | 'medium' | 'strong';
  durationMs: number;
}

export const resolveHapticPattern = (event: HapticEvent): HapticPattern => {
  if (event === 'outcome_achieved') {
    return { event, intensity: 'strong', durationMs: 80 };
  }
  if (event === 'checkpoint_approved') {
    return { event, intensity: 'medium', durationMs: 55 };
  }
  return { event, intensity: 'light', durationMs: 35 };
};
