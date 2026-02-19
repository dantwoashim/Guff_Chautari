export interface WidgetQuickCapture {
  type: 'quick_capture';
  pendingDraftCount: number;
}

export interface WidgetOutcomeTracker {
  type: 'outcome_tracker';
  completedToday: number;
  totalToday: number;
}

export interface WidgetNextAction {
  type: 'next_action';
  label: string;
  route: string;
}

export const buildQuickCaptureWidget = (pendingDraftCount: number): WidgetQuickCapture => ({
  type: 'quick_capture',
  pendingDraftCount: Math.max(0, Math.floor(pendingDraftCount)),
});

export const buildOutcomeWidget = (payload: {
  completedToday: number;
  totalToday: number;
}): WidgetOutcomeTracker => ({
  type: 'outcome_tracker',
  completedToday: Math.max(0, Math.floor(payload.completedToday)),
  totalToday: Math.max(0, Math.floor(payload.totalToday)),
});

export const buildNextActionWidget = (payload: {
  label: string;
  route: string;
}): WidgetNextAction => ({
  type: 'next_action',
  label: payload.label,
  route: payload.route,
});
