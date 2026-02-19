import type { ApprovalRequest, ApprovalStatus, PolicyEvaluationInput } from './types';

const HOURS_24_MS = 24 * 60 * 60 * 1000;

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

const toIso = (value: string | number | Date): string => {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'number') {
    return new Date(value).toISOString();
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? new Date().toISOString() : new Date(parsed).toISOString();
};

const isExpired = (request: ApprovalRequest, nowIso: string): boolean => {
  return Date.parse(request.expires_at) <= Date.parse(nowIso);
};

export class ApprovalQueue {
  private readonly requests = new Map<string, ApprovalRequest>();
  private readonly now: () => string;

  constructor(now: () => string = () => new Date().toISOString()) {
    this.now = now;
  }

  createRequest(params: {
    payload: PolicyEvaluationInput;
    reason: string;
    expiresAtIso?: string;
  }): ApprovalRequest {
    const requestedAt = this.now();
    const expiresAt = params.expiresAtIso ?? new Date(Date.parse(requestedAt) + HOURS_24_MS).toISOString();

    const request: ApprovalRequest = {
      id: makeId('approval'),
      action_id: params.payload.action.action_id,
      actor_user_id: params.payload.actor.user_id,
      risk_tier: 'red',
      reason: params.reason,
      status: 'pending',
      requested_at: requestedAt,
      expires_at: toIso(expiresAt),
      payload: params.payload,
    };

    this.requests.set(request.id, request);
    return request;
  }

  getById(id: string): ApprovalRequest | null {
    const entry = this.requests.get(id);
    return entry ?? null;
  }

  list(status?: ApprovalStatus): ApprovalRequest[] {
    const rows = Array.from(this.requests.values());
    if (!status) {
      return rows.sort((left, right) => Date.parse(right.requested_at) - Date.parse(left.requested_at));
    }

    return rows
      .filter((row) => row.status === status)
      .sort((left, right) => Date.parse(right.requested_at) - Date.parse(left.requested_at));
  }

  decide(params: {
    requestId: string;
    decision: 'approve' | 'reject';
    reviewerUserId: string;
    decidedAtIso?: string;
  }): ApprovalRequest {
    const existing = this.requests.get(params.requestId);
    if (!existing) {
      throw new Error(`Approval request ${params.requestId} not found`);
    }

    const decidedAt = params.decidedAtIso ? toIso(params.decidedAtIso) : this.now();
    const expired = isExpired(existing, decidedAt);

    if (existing.status !== 'pending') {
      throw new Error(`Approval request ${params.requestId} is already ${existing.status}`);
    }

    const next: ApprovalRequest = {
      ...existing,
      status: expired ? 'expired' : params.decision === 'approve' ? 'approved' : 'rejected',
      decided_at: decidedAt,
      decided_by: params.reviewerUserId,
    };

    this.requests.set(next.id, next);
    return next;
  }

  expirePending(nowIso = this.now()): ApprovalRequest[] {
    const expired: ApprovalRequest[] = [];

    for (const request of this.requests.values()) {
      if (request.status !== 'pending') continue;
      if (!isExpired(request, nowIso)) continue;

      const next: ApprovalRequest = {
        ...request,
        status: 'expired',
        decided_at: nowIso,
      };

      this.requests.set(next.id, next);
      expired.push(next);
    }

    return expired;
  }
}

