import type { RelationshipState, RepairAction, RepairEvaluation } from './types';

const requiredActions: RepairAction[] = ['acknowledge_harm', 'apology', 'behavior_change'];

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

export const evaluateRepairActions = (actions: RepairAction[]): RepairEvaluation => {
  const uniqueActions = new Set(actions);
  const missingActions = requiredActions.filter((action) => !uniqueActions.has(action));

  const score = clamp((requiredActions.length - missingActions.length) / requiredActions.length, 0, 1);

  return {
    score,
    completed: missingActions.length === 0,
    missingActions,
  };
};

export const applyRepairMechanism = (
  state: RelationshipState,
  actions: RepairAction[]
): RelationshipState => {
  const evaluation = evaluateRepairActions(actions);

  if (!state.unresolvedConflict) {
    return {
      ...state,
      repairProgress: evaluation.score,
    };
  }

  if (!evaluation.completed) {
    return {
      ...state,
      repairProgress: evaluation.score,
      trustScore: clamp(state.trustScore - 0.01, 0, 1),
    };
  }

  return {
    ...state,
    unresolvedConflict: false,
    repairProgress: 1,
    trustScore: clamp(state.trustScore + 0.08, 0, 1),
  };
};
