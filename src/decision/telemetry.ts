import type { DecisionTelemetryEvent, DecisionTelemetryEventType } from './types';

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

export class DecisionTelemetry {
  private readonly events: DecisionTelemetryEvent[] = [];
  private readonly nowIso: () => string;

  constructor(nowIso: () => string = () => new Date().toISOString()) {
    this.nowIso = nowIso;
  }

  record(
    type: DecisionTelemetryEventType,
    decisionId: string,
    metadata: Record<string, string | number | boolean>
  ): DecisionTelemetryEvent {
    const event: DecisionTelemetryEvent = {
      id: makeId('decision-event'),
      type,
      decision_id: decisionId,
      created_at_iso: this.nowIso(),
      metadata,
    };

    this.events.push(event);
    return event;
  }

  recordDecisionCreated(decisionId: string, optionCount: number, criterionCount: number): DecisionTelemetryEvent {
    return this.record('decision_created', decisionId, {
      option_count: optionCount,
      criterion_count: criterionCount,
    });
  }

  recordDecisionCompleted(
    decisionId: string,
    selectedOptionId: string,
    assumptionRefCount: number
  ): DecisionTelemetryEvent {
    return this.record('decision_completed', decisionId, {
      selected_option_id: selectedOptionId,
      assumption_ref_count: assumptionRefCount,
    });
  }

  recordDecisionFollowThrough(
    decisionId: string,
    outcome: 'success' | 'partial' | 'failed',
    score: number
  ): DecisionTelemetryEvent {
    return this.record('decision_follow_through', decisionId, {
      outcome,
      score,
    });
  }

  listAll(): DecisionTelemetryEvent[] {
    return [...this.events].sort(
      (left, right) => Date.parse(left.created_at_iso) - Date.parse(right.created_at_iso)
    );
  }

  listByDecision(decisionId: string): DecisionTelemetryEvent[] {
    return this.listAll().filter((event) => event.decision_id === decisionId);
  }
}
