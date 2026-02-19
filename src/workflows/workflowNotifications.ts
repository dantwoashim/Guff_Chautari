import { WorkflowStore, workflowStore } from './store';
import type { WorkflowExecution, WorkflowNotification } from './types';

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

const buildMessage = (execution: WorkflowExecution): string => {
  if (execution.status === 'completed') {
    return `Workflow completed in ${execution.durationMs}ms.`;
  }
  if (execution.status === 'checkpoint_required') {
    return 'Workflow paused: checkpoint review is required before continuing.';
  }
  if (execution.status === 'approval_required') {
    return 'Workflow paused: approval is required for a connector action.';
  }
  return 'Workflow failed. Review execution history for details.';
};

const levelForStatus = (status: WorkflowExecution['status']): WorkflowNotification['level'] => {
  if (status === 'completed') return 'info';
  if (status === 'approval_required' || status === 'checkpoint_required') return 'warning';
  return 'error';
};

export const publishWorkflowNotification = (
  userId: string,
  execution: WorkflowExecution,
  store: WorkflowStore = workflowStore
): WorkflowNotification => {
  const notification: WorkflowNotification = {
    id: makeId('wf-notification'),
    userId,
    workflowId: execution.workflowId,
    executionId: execution.id,
    level: levelForStatus(execution.status),
    message: buildMessage(execution),
    status: execution.status,
    createdAtIso: execution.finishedAtIso,
    read: false,
  };
  return store.appendNotification(userId, notification);
};

export const listWorkflowNotifications = (
  userId: string,
  store: WorkflowStore = workflowStore
): WorkflowNotification[] => {
  return store.listNotifications(userId);
};

export const markWorkflowNotificationRead = (
  userId: string,
  notificationId: string,
  store: WorkflowStore = workflowStore
): void => {
  store.markNotificationRead(userId, notificationId);
};
