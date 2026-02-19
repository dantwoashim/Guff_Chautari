export type PushNotificationType =
  | 'workflow.checkpoint_pending'
  | 'outcome.nudge'
  | 'team.briefing_ready'
  | 'ambient.checkin';

export interface PushNotificationPayload {
  id: string;
  type: PushNotificationType;
  title: string;
  body: string;
  entityId?: string;
  createdAtIso: string;
}

export interface PushActionResult {
  notificationId: string;
  action: 'open' | 'approve' | 'defer';
  route: string;
}

export const routeNotification = (notification: PushNotificationPayload): string => {
  switch (notification.type) {
    case 'workflow.checkpoint_pending':
      return '/workflow';
    case 'team.briefing_ready':
      return '/knowledge';
    case 'ambient.checkin':
      return '/chat';
    case 'outcome.nudge':
    default:
      return '/decision';
  }
};

export const handleNotificationAction = (
  notification: PushNotificationPayload,
  action: PushActionResult['action']
): PushActionResult => ({
  notificationId: notification.id,
  action,
  route: routeNotification(notification),
});
