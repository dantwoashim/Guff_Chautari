export type RiskTier = 'green' | 'yellow' | 'red';
export type PolicyDecision = 'allow' | 'deny' | 'escalate';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired';
export type ActorRole = 'owner' | 'member' | 'guest' | 'system';

export interface PolicyDecisionSchema {
  decision: PolicyDecision;
  risk_tier: RiskTier;
  reason: string;
  expires_at: string | null;
}

export interface PolicyActor {
  user_id: string;
  role: ActorRole;
  workspace_id?: string;
}

export interface PolicyAction {
  action_id: string;
  resource_type: string;
  mutation: boolean;
  idempotent?: boolean;
  metadata?: Record<string, string | number | boolean>;
}

export interface PolicyEvaluationInput {
  actor: PolicyActor;
  action: PolicyAction;
  now_iso?: string;
}

export interface PolicyDecisionRecord extends PolicyDecisionSchema {
  id: string;
  actor_user_id: string;
  action_id: string;
  resource_type: string;
  created_at: string;
  metadata: Record<string, unknown>;
}

export interface ApprovalRequest {
  id: string;
  action_id: string;
  actor_user_id: string;
  risk_tier: 'red';
  reason: string;
  status: ApprovalStatus;
  requested_at: string;
  expires_at: string;
  payload: PolicyEvaluationInput;
  decided_at?: string;
  decided_by?: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export const isRiskTier = (value: unknown): value is RiskTier => {
  return value === 'green' || value === 'yellow' || value === 'red';
};

export const isPolicyDecision = (value: unknown): value is PolicyDecision => {
  return value === 'allow' || value === 'deny' || value === 'escalate';
};

export const validatePolicyDecisionSchema = (
  value: Partial<PolicyDecisionSchema>
): ValidationResult => {
  const errors: string[] = [];

  if (!isPolicyDecision(value.decision)) {
    errors.push('decision must be one of allow|deny|escalate');
  }

  if (!isRiskTier(value.risk_tier)) {
    errors.push('risk_tier must be one of green|yellow|red');
  }

  if (typeof value.reason !== 'string' || value.reason.trim().length === 0) {
    errors.push('reason must be a non-empty string');
  }

  if (!(value.expires_at === null || typeof value.expires_at === 'string')) {
    errors.push('expires_at must be null or ISO string');
  }

  return {
    ok: errors.length === 0,
    errors,
  };
};

