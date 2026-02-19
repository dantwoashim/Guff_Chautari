import { describe, expect, it } from 'vitest';
import { applyRepairMechanism, evaluateRepairActions } from '../repairMechanism';
import { createInitialRelationshipState } from '../relationshipEngine';

describe('repairMechanism', () => {
  it('requires explicit repair actions for conflict resolution', () => {
    const state = {
      ...createInitialRelationshipState('secure'),
      unresolvedConflict: true,
      trustScore: 0.62,
    };

    const partial = applyRepairMechanism(state, ['acknowledge_harm']);
    const complete = applyRepairMechanism(state, [
      'acknowledge_harm',
      'apology',
      'behavior_change',
      'follow_through',
    ]);

    expect(partial.unresolvedConflict).toBe(true);
    expect(complete.unresolvedConflict).toBe(false);
    expect(complete.trustScore).toBeGreaterThan(partial.trustScore);
  });

  it('reports missing required repair actions', () => {
    const result = evaluateRepairActions(['apology']);

    expect(result.completed).toBe(false);
    expect(result.missingActions).toContain('acknowledge_harm');
    expect(result.missingActions).toContain('behavior_change');
  });
});
