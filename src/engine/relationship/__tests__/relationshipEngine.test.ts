import { describe, expect, it } from 'vitest';
import {
  createInitialRelationshipState,
  determineTargetStage,
  updateRelationshipState,
} from '../relationshipEngine';

describe('relationshipEngine', () => {
  it('uses explicit stage state machine with defined stages', () => {
    const target = determineTargetStage({
      trustScore: 0.8,
      messageCount: 300,
      daysTogether: 40,
      unresolvedConflict: false,
    });

    expect(target).toBe('close');

    const state = createInitialRelationshipState('secure');
    const next = updateRelationshipState(state, {
      positiveSignals: 10,
      negativeSignals: 0,
      daysElapsed: 10,
    });

    expect(['stranger', 'acquaintance', 'friend', 'close', 'intimate']).toContain(next.stage);
  });

  it('progresses through stages over repeated positive interactions', () => {
    let state = createInitialRelationshipState('secure');

    for (let turn = 0; turn < 180; turn += 1) {
      state = updateRelationshipState(state, {
        positiveSignals: 2,
        negativeSignals: 0,
        daysElapsed: 1,
      });
    }

    expect(['friend', 'close', 'intimate']).toContain(state.stage);
    expect(state.trustScore).toBeGreaterThan(0.75);
  });

  it('does not auto-recover trust after conflict without repair', () => {
    let state = createInitialRelationshipState('secure');

    state = updateRelationshipState(state, {
      positiveSignals: 3,
      daysElapsed: 5,
    });

    const trustBeforeConflict = state.trustScore;

    state = updateRelationshipState(state, {
      negativeSignals: 2,
      conflictTriggered: true,
      daysElapsed: 1,
    });

    state = updateRelationshipState(state, {
      positiveSignals: 2,
      daysElapsed: 1,
      repairActions: [],
    });

    expect(state.unresolvedConflict).toBe(true);
    expect(state.trustScore).toBeLessThan(trustBeforeConflict);
  });
});
