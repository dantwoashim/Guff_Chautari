import { ApprovalQueue } from './approvalQueue';
import { PolicyAuditLogStore } from './auditLog';
import { classifyRiskTier } from './riskClassifier';
import type {
  ApprovalRequest,
  PolicyDecisionRecord,
  PolicyEvaluationInput,
  RiskTier,
} from './types';
import { validatePolicyDecisionSchema } from './types';
import { composeRegionalDecisionMetadata, type RegionalSafetyContext } from './regionalSafety';

const YELLOW_NOTIFY_SECONDS = 30;
const RED_APPROVAL_TTL_HOURS = 24;

const sensitiveResources = new Set([
  'byok_key',
  'byok_keys',
  'policy_rule',
  'policy_rules',
  'connector_permission',
  'connector_permissions',
]);

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

const addSeconds = (iso: string, seconds: number): string => {
  return new Date(Date.parse(iso) + seconds * 1000).toISOString();
};

const addHours = (iso: string, hours: number): string => {
  return new Date(Date.parse(iso) + hours * 60 * 60 * 1000).toISOString();
};

const buildDecisionRecord = (params: {
  nowIso: string;
  input: PolicyEvaluationInput;
  riskTier: RiskTier;
  decision: PolicyDecisionRecord['decision'];
  reason: string;
  expiresAt: string | null;
  metadata?: Record<string, unknown>;
}): PolicyDecisionRecord => {
  const record: PolicyDecisionRecord = {
    id: makeId('policy'),
    actor_user_id: params.input.actor.user_id,
    action_id: params.input.action.action_id,
    resource_type: params.input.action.resource_type,
    decision: params.decision,
    risk_tier: params.riskTier,
    reason: params.reason,
    expires_at: params.expiresAt,
    created_at: params.nowIso,
    metadata: params.metadata ?? {},
  };

  const validation = validatePolicyDecisionSchema(record);
  if (!validation.ok) {
    throw new Error(`Invalid policy decision schema: ${validation.errors.join(', ')}`);
  }

  return record;
};

export interface PolicyEvaluationResult {
  decision: PolicyDecisionRecord;
  approval_request?: ApprovalRequest;
}

interface PolicyEngineOptions {
  queue?: ApprovalQueue;
  auditLog?: PolicyAuditLogStore;
  nowIso?: () => string;
}

export class PolicyEngine {
  readonly queue: ApprovalQueue;
  readonly auditLog: PolicyAuditLogStore;
  private readonly nowIso: () => string;

  constructor(options: PolicyEngineOptions = {}) {
    this.nowIso = options.nowIso ?? (() => new Date().toISOString());
    this.queue = options.queue ?? new ApprovalQueue(this.nowIso);
    this.auditLog = options.auditLog ?? new PolicyAuditLogStore(this.nowIso);
  }

  evaluate(input: PolicyEvaluationInput): PolicyEvaluationResult {
    const nowIso = input.now_iso ?? this.nowIso();

    if (this.isUnauthorizedMutation(input)) {
      const denied = buildDecisionRecord({
        nowIso,
        input,
        riskTier: 'red',
        decision: 'deny',
        reason: 'unauthorized mutation attempt',
        expiresAt: null,
      });
      this.auditLog.appendDecision(denied);
      return { decision: denied };
    }

    const classification = classifyRiskTier(input.action);

    if (classification.risk_tier === 'green') {
      const allow = buildDecisionRecord({
        nowIso,
        input,
        riskTier: 'green',
        decision: 'allow',
        reason: classification.reason,
        expiresAt: null,
      });
      this.auditLog.appendDecision(allow);
      return { decision: allow };
    }

    if (classification.risk_tier === 'yellow') {
      const expiresAt = addSeconds(nowIso, YELLOW_NOTIFY_SECONDS);
      const allowWithNotice = buildDecisionRecord({
        nowIso,
        input,
        riskTier: 'yellow',
        decision: 'allow',
        reason: `notify+${YELLOW_NOTIFY_SECONDS}s:${classification.reason}`,
        expiresAt,
        metadata: {
          notify_window_seconds: YELLOW_NOTIFY_SECONDS,
        },
      });
      this.auditLog.appendDecision(allowWithNotice);
      return { decision: allowWithNotice };
    }

    const approvalExpiry = addHours(nowIso, RED_APPROVAL_TTL_HOURS);
    const pending = this.queue.createRequest({
      payload: {
        ...input,
        now_iso: nowIso,
      },
      reason: classification.reason,
      expiresAtIso: approvalExpiry,
    });

    this.auditLog.appendApprovalRequest(pending);

    const escalated = buildDecisionRecord({
      nowIso,
      input,
      riskTier: 'red',
      decision: 'escalate',
      reason: `approval_required:${classification.reason}`,
      expiresAt: approvalExpiry,
      metadata: {
        approval_request_id: pending.id,
      },
    });

    this.auditLog.appendDecision(escalated);

    return {
      decision: escalated,
      approval_request: pending,
    };
  }

  evaluateWithRegionalContext(
    input: PolicyEvaluationInput,
    context: RegionalSafetyContext
  ): PolicyEvaluationResult {
    const result = this.evaluate(input);
    return {
      ...result,
      decision: composeRegionalDecisionMetadata({
        decision: result.decision,
        context,
        input,
      }),
    };
  }

  resolveApproval(params: {
    requestId: string;
    reviewerUserId: string;
    approve: boolean;
    decidedAtIso?: string;
  }): PolicyEvaluationResult {
    const resolved = this.queue.decide({
      requestId: params.requestId,
      decision: params.approve ? 'approve' : 'reject',
      reviewerUserId: params.reviewerUserId,
      decidedAtIso: params.decidedAtIso,
    });

    this.auditLog.appendApprovalResolution(resolved);

    const nowIso = params.decidedAtIso ?? this.nowIso();
    const decision = buildDecisionRecord({
      nowIso,
      input: resolved.payload,
      riskTier: 'red',
      decision: resolved.status === 'approved' ? 'allow' : 'deny',
      reason:
        resolved.status === 'expired'
          ? 'approval_expired'
          : resolved.status === 'approved'
            ? 'approval_granted'
            : 'approval_rejected',
      expiresAt: null,
      metadata: {
        approval_request_id: resolved.id,
        resolved_status: resolved.status,
        decided_by: resolved.decided_by ?? null,
      },
    });

    this.auditLog.appendDecision(decision);

    return {
      decision,
      approval_request: resolved,
    };
  }

  expirePendingApprovals(nowIso = this.nowIso()): ApprovalRequest[] {
    const expired = this.queue.expirePending(nowIso);
    for (const request of expired) {
      this.auditLog.appendApprovalResolution(request);
    }
    return expired;
  }

  private isUnauthorizedMutation(input: PolicyEvaluationInput): boolean {
    if (!input.action.mutation) return false;

    if (input.actor.role === 'guest') {
      return true;
    }

    if (
      sensitiveResources.has(input.action.resource_type) &&
      input.actor.role !== 'owner' &&
      input.actor.role !== 'system'
    ) {
      return true;
    }

    if (input.action.action_id.startsWith('admin.') && input.actor.role !== 'owner') {
      return true;
    }

    return false;
  }
}

export const policyEngine = new PolicyEngine();
