import {
  type AutonomyGuardrailPolicy,
  type AutonomyUsage,
  type GuardrailActionInput,
  type GuardrailEscalation,
  type GuardrailEscalationType,
  type GuardrailEvaluation,
} from './types';

interface RegisterPlanInput {
  planId: string;
  policy: AutonomyGuardrailPolicy;
  nowIso?: string;
}

interface ResolveEscalationInput {
  escalationId: string;
  decision: 'approve' | 'reject';
  reviewerUserId: string;
  nowIso?: string;
}

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

const defaultUsage = (): AutonomyUsage => ({
  tokensUsed: 0,
  apiCalls: 0,
  connectorActions: 0,
  runtimeMinutes: 0,
});

const parseMs = (iso: string): number => {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const mergeUsage = (current: AutonomyUsage, delta: Partial<AutonomyUsage>): AutonomyUsage => ({
  tokensUsed: Math.max(0, current.tokensUsed + Math.max(0, delta.tokensUsed ?? 0)),
  apiCalls: Math.max(0, current.apiCalls + Math.max(0, delta.apiCalls ?? 0)),
  connectorActions: Math.max(
    0,
    current.connectorActions + Math.max(0, delta.connectorActions ?? 0)
  ),
  runtimeMinutes: Math.max(0, current.runtimeMinutes + Math.max(0, delta.runtimeMinutes ?? 0)),
});

const pct = (value: number, max: number): number => {
  if (max <= 0) return 1;
  return value / max;
};

export class AutonomyGuardrails {
  private readonly policyByPlanId = new Map<string, AutonomyGuardrailPolicy>();
  private readonly usageByPlanId = new Map<string, AutonomyUsage>();
  private readonly startedAtByPlanId = new Map<string, string>();
  private readonly pausedPlans = new Set<string>();
  private readonly approvedIrreversibleByPlan = new Map<string, Set<string>>();
  private readonly escalations = new Map<string, GuardrailEscalation>();
  private killSwitch = false;
  private killSwitchReason = '';
  private readonly nowIso: () => string;

  constructor(options: { nowIso?: () => string } = {}) {
    this.nowIso = options.nowIso ?? (() => new Date().toISOString());
  }

  registerPlan(input: RegisterPlanInput): void {
    const nowIso = input.nowIso ?? this.nowIso();
    this.policyByPlanId.set(input.planId, input.policy);
    this.startedAtByPlanId.set(input.planId, nowIso);
    if (!this.usageByPlanId.has(input.planId)) {
      this.usageByPlanId.set(input.planId, defaultUsage());
    }
  }

  getUsage(planId: string): AutonomyUsage {
    return this.usageByPlanId.get(planId) ?? defaultUsage();
  }

  recordUsage(planId: string, delta: Partial<AutonomyUsage>): AutonomyUsage {
    const next = mergeUsage(this.getUsage(planId), delta);
    this.usageByPlanId.set(planId, next);
    return next;
  }

  evaluateAction(input: GuardrailActionInput): GuardrailEvaluation {
    if (this.killSwitch) {
      const escalation = this.ensureEscalation({
        planId: input.planId,
        type: 'kill_switch',
        reason: `Kill switch active: ${this.killSwitchReason || 'manual halt'}`,
        metadata: {
          actionId: input.actionId,
        },
      });
      this.pausedPlans.add(input.planId);
      return {
        allow: false,
        blockedByKillSwitch: true,
        escalation,
      };
    }

    const policy = this.policyByPlanId.get(input.planId);
    if (!policy) {
      return {
        allow: true,
        blockedByKillSwitch: false,
      };
    }

    const nowIso = input.nowIso ?? this.nowIso();
    const usage = this.getUsage(input.planId);
    const projected = mergeUsage(usage, input.estimatedUsage ?? {});

    if (input.irreversible && !this.isIrreversibleApproved(input.planId, input.actionId)) {
      const escalation = this.ensureEscalation({
        planId: input.planId,
        type: 'irreversible',
        reason: 'Irreversible action requires explicit user approval.',
        metadata: {
          actionId: input.actionId,
        },
      });
      this.pausedPlans.add(input.planId);
      return {
        allow: false,
        blockedByKillSwitch: false,
        escalation,
      };
    }

    const budget = policy.resourceBudget;
    const hardBudgetExceeded =
      projected.tokensUsed > budget.maxTokens ||
      projected.apiCalls > budget.maxApiCalls ||
      projected.connectorActions > budget.maxConnectorActions;

    const elapsedRuntimeHours = this.computeElapsedHours(input.planId, nowIso, projected.runtimeMinutes);
    const overTimebox = elapsedRuntimeHours >= budget.maxRuntimeHours;

    if (hardBudgetExceeded || overTimebox) {
      const escalation = this.ensureEscalation({
        planId: input.planId,
        type: overTimebox ? 'timebox' : 'budget',
        reason: overTimebox
          ? 'Autonomous session exceeded maximum runtime.'
          : 'Resource budget exceeded for autonomous plan.',
        metadata: {
          actionId: input.actionId,
          tokensUsed: projected.tokensUsed,
          apiCalls: projected.apiCalls,
          connectorActions: projected.connectorActions,
        },
      });
      this.pausedPlans.add(input.planId);
      return {
        allow: false,
        blockedByKillSwitch: false,
        escalation,
      };
    }

    const usagePct = Math.max(
      pct(projected.tokensUsed, budget.maxTokens),
      pct(projected.apiCalls, budget.maxApiCalls),
      pct(projected.connectorActions, budget.maxConnectorActions)
    );
    if (usagePct >= policy.escalationThresholdPct) {
      const escalation = this.ensureEscalation({
        planId: input.planId,
        type: 'budget',
        reason: `Plan crossed ${Math.round(policy.escalationThresholdPct * 100)}% of resource budget.`,
        metadata: {
          actionId: input.actionId,
          usagePct: Number(usagePct.toFixed(4)),
        },
      });
      this.pausedPlans.add(input.planId);
      return {
        allow: false,
        blockedByKillSwitch: false,
        escalation,
      };
    }

    return {
      allow: !this.pausedPlans.has(input.planId),
      blockedByKillSwitch: false,
    };
  }

  resolveEscalation(input: ResolveEscalationInput): GuardrailEscalation {
    const escalation = this.escalations.get(input.escalationId);
    if (!escalation) {
      throw new Error(`Escalation ${input.escalationId} not found.`);
    }
    if (escalation.status !== 'pending') {
      throw new Error(`Escalation ${input.escalationId} is already ${escalation.status}.`);
    }

    const nowIso = input.nowIso ?? this.nowIso();
    const next: GuardrailEscalation = {
      ...escalation,
      status: input.decision === 'approve' ? 'approved' : 'rejected',
      resolvedAtIso: nowIso,
      resolvedByUserId: input.reviewerUserId,
    };
    this.escalations.set(next.id, next);

    if (next.type === 'irreversible' && input.decision === 'approve') {
      const actionId =
        typeof next.metadata?.actionId === 'string' ? next.metadata.actionId : undefined;
      if (actionId) {
        const set = this.approvedIrreversibleByPlan.get(next.planId) ?? new Set<string>();
        set.add(actionId);
        this.approvedIrreversibleByPlan.set(next.planId, set);
      }
    }

    if (this.hasPendingEscalations(next.planId)) {
      this.pausedPlans.add(next.planId);
    } else if (!this.killSwitch) {
      this.pausedPlans.delete(next.planId);
    }

    return next;
  }

  listEscalations(payload?: {
    planId?: string;
    status?: GuardrailEscalation['status'];
  }): GuardrailEscalation[] {
    const rows = [...this.escalations.values()];
    return rows
      .filter((row) => (payload?.planId ? row.planId === payload.planId : true))
      .filter((row) => (payload?.status ? row.status === payload.status : true))
      .sort((left, right) => parseMs(right.createdAtIso) - parseMs(left.createdAtIso));
  }

  activateKillSwitch(reason: string, nowIso = this.nowIso()): void {
    this.killSwitch = true;
    this.killSwitchReason = reason.trim() || 'manual halt';

    for (const planId of this.policyByPlanId.keys()) {
      this.pausedPlans.add(planId);
      this.ensureEscalation({
        planId,
        type: 'kill_switch',
        reason: `Kill switch active: ${this.killSwitchReason}`,
        metadata: {
          activatedAtIso: nowIso,
        },
      });
    }
  }

  clearKillSwitch(): void {
    this.killSwitch = false;
    this.killSwitchReason = '';
    for (const planId of this.policyByPlanId.keys()) {
      if (!this.hasPendingEscalations(planId)) {
        this.pausedPlans.delete(planId);
      }
    }
  }

  isKillSwitchActive(): boolean {
    return this.killSwitch;
  }

  isPlanPaused(planId: string): boolean {
    return this.pausedPlans.has(planId);
  }

  private hasPendingEscalations(planId: string): boolean {
    return this.listEscalations({ planId, status: 'pending' }).length > 0;
  }

  private isIrreversibleApproved(planId: string, actionId: string): boolean {
    return this.approvedIrreversibleByPlan.get(planId)?.has(actionId) ?? false;
  }

  private computeElapsedHours(planId: string, nowIso: string, runtimeMinutes: number): number {
    const startedAtIso = this.startedAtByPlanId.get(planId);
    if (!startedAtIso) {
      return runtimeMinutes / 60;
    }
    const elapsedByClock = Math.max(0, (parseMs(nowIso) - parseMs(startedAtIso)) / (60 * 60 * 1000));
    return Math.max(elapsedByClock, runtimeMinutes / 60);
  }

  private ensureEscalation(payload: {
    planId: string;
    type: GuardrailEscalationType;
    reason: string;
    metadata?: Record<string, string | number | boolean>;
  }): GuardrailEscalation {
    const existing = [...this.escalations.values()].find((row) => {
      if (row.planId !== payload.planId) return false;
      if (row.type !== payload.type) return false;
      if (row.status !== 'pending') return false;
      const actionId = typeof payload.metadata?.actionId === 'string' ? payload.metadata.actionId : '';
      const existingActionId =
        typeof row.metadata?.actionId === 'string' ? row.metadata.actionId : '';
      return actionId === existingActionId;
    });
    if (existing) {
      return existing;
    }

    const escalation: GuardrailEscalation = {
      id: makeId('autonomy-escalation'),
      planId: payload.planId,
      type: payload.type,
      status: 'pending',
      reason: payload.reason,
      metadata: payload.metadata,
      createdAtIso: this.nowIso(),
    };
    this.escalations.set(escalation.id, escalation);
    return escalation;
  }
}

export const autonomyGuardrails = new AutonomyGuardrails();
