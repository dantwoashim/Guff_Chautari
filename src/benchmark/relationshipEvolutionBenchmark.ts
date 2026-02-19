import {
  createInitialRelationshipState,
  updateRelationshipState,
  type AttachmentStyle,
  type RelationshipInteraction,
  type RepairAction,
  type RelationshipState,
} from '../engine/relationship';

export interface RelationshipEvolutionBenchmarkResult {
  turns: number;
  initialStage: RelationshipState['stage'];
  finalStage: RelationshipState['stage'];
  finalTrustScore: number;
  trustSeries: number[];
  intensitySeries: number[];
  comfortSeries: number[];
  unresolvedConflictTurns: number;
  repairRecovered: boolean;
}

export const runRelationshipEvolutionBenchmark = (params: {
  turns?: number;
  attachmentStyle?: AttachmentStyle;
} = {}): RelationshipEvolutionBenchmarkResult => {
  const turns = params.turns ?? 100;
  let state = createInitialRelationshipState(params.attachmentStyle ?? 'secure');

  const trustSeries: number[] = [];
  const intensitySeries: number[] = [];
  const comfortSeries: number[] = [];
  let unresolvedConflictTurns = 0;

  for (let turn = 0; turn < turns; turn += 1) {
    const repairActions: RepairAction[] =
      turn === 42
        ? ['acknowledge_harm']
        : turn === 43
          ? ['acknowledge_harm', 'apology']
          : turn === 44
            ? ['acknowledge_harm', 'apology', 'behavior_change', 'follow_through']
            : [];

    const interaction: RelationshipInteraction = {
      positiveSignals: turn % 5 === 0 ? 2 : 1,
      negativeSignals: turn % 17 === 0 ? 1 : 0,
      conflictTriggered: turn === 40,
      repairActions,
      silenceHours: turn % 9 === 0 ? 14 : 4,
      daysElapsed: 1,
    };

    state = updateRelationshipState(state, interaction);

    trustSeries.push(state.trustScore);
    intensitySeries.push(state.seasonal.intensity);
    comfortSeries.push(state.seasonal.comfort);

    if (state.unresolvedConflict) {
      unresolvedConflictTurns += 1;
    }
  }

  return {
    turns,
    initialStage: 'stranger',
    finalStage: state.stage,
    finalTrustScore: Number(state.trustScore.toFixed(4)),
    trustSeries,
    intensitySeries,
    comfortSeries,
    unresolvedConflictTurns,
    repairRecovered: !state.unresolvedConflict,
  };
};
