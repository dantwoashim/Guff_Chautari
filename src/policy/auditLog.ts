import type { ApprovalRequest, PolicyDecisionRecord } from './types';

export type PolicyAuditEventType =
  | 'policy_decision'
  | 'approval_requested'
  | 'approval_resolved'
  | 'approval_expired';

export interface PolicyAuditEvent {
  id: string;
  event_type: PolicyAuditEventType;
  action_id: string;
  actor_user_id: string;
  created_at: string;
  detail: Record<string, unknown>;
}

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

export class PolicyAuditLogStore {
  private readonly entries: PolicyAuditEvent[] = [];
  private readonly now: () => string;

  constructor(now: () => string = () => new Date().toISOString()) {
    this.now = now;
  }

  appendDecision(decision: PolicyDecisionRecord): PolicyAuditEvent {
    const event: PolicyAuditEvent = {
      id: makeId('audit'),
      event_type: 'policy_decision',
      action_id: decision.action_id,
      actor_user_id: decision.actor_user_id,
      created_at: this.now(),
      detail: {
        decision: decision.decision,
        risk_tier: decision.risk_tier,
        reason: decision.reason,
        expires_at: decision.expires_at,
      },
    };

    this.entries.push(event);
    return event;
  }

  appendApprovalRequest(request: ApprovalRequest): PolicyAuditEvent {
    const event: PolicyAuditEvent = {
      id: makeId('audit'),
      event_type: 'approval_requested',
      action_id: request.action_id,
      actor_user_id: request.actor_user_id,
      created_at: this.now(),
      detail: {
        request_id: request.id,
        reason: request.reason,
        expires_at: request.expires_at,
      },
    };
    this.entries.push(event);
    return event;
  }

  appendApprovalResolution(request: ApprovalRequest): PolicyAuditEvent {
    const event: PolicyAuditEvent = {
      id: makeId('audit'),
      event_type: request.status === 'expired' ? 'approval_expired' : 'approval_resolved',
      action_id: request.action_id,
      actor_user_id: request.actor_user_id,
      created_at: this.now(),
      detail: {
        request_id: request.id,
        status: request.status,
        decided_by: request.decided_by ?? null,
        decided_at: request.decided_at ?? null,
      },
    };
    this.entries.push(event);
    return event;
  }

  listAll(): PolicyAuditEvent[] {
    return [...this.entries].sort(
      (left, right) => Date.parse(right.created_at) - Date.parse(left.created_at)
    );
  }

  listByAction(actionId: string): PolicyAuditEvent[] {
    return this.listAll().filter((entry) => entry.action_id === actionId);
  }

  listByActor(actorUserId: string): PolicyAuditEvent[] {
    return this.listAll().filter((entry) => entry.actor_user_id === actorUserId);
  }
}

export const buildAuditTrailLines = (events: ReadonlyArray<PolicyAuditEvent>): string[] => {
  return events.map(
    (event) =>
      `${event.created_at} ${event.event_type} action=${event.action_id} actor=${event.actor_user_id}`
  );
};

