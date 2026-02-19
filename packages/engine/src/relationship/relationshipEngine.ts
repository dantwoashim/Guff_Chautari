import { evaluateAttachmentImpact, getAttachmentBehaviorProfile } from './attachmentModel';
import { applyRepairMechanism } from './repairMechanism';
import { advanceSeasonalState, computeSeasonalState } from './seasonalDynamics';
import type {
  AttachmentStyle,
  RelationshipInteraction,
  RelationshipStage,
  RelationshipState,
} from './types';

const stageOrder: RelationshipStage[] = [
  'stranger',
  'acquaintance',
  'friend',
  'close',
  'intimate',
];

const stageTransitions: Record<RelationshipStage, { up?: RelationshipStage; down?: RelationshipStage }> = {
  stranger: { up: 'acquaintance' },
  acquaintance: { up: 'friend', down: 'stranger' },
  friend: { up: 'close', down: 'acquaintance' },
  close: { up: 'intimate', down: 'friend' },
  intimate: { down: 'close' },
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

const toRank = (stage: RelationshipStage): number => {
  return stageOrder.indexOf(stage);
};

const stepStage = (current: RelationshipStage, target: RelationshipStage): RelationshipStage => {
  const currentRank = toRank(current);
  const targetRank = toRank(target);

  if (currentRank === targetRank) return current;

  if (targetRank > currentRank) {
    return stageTransitions[current].up ?? current;
  }

  return stageTransitions[current].down ?? current;
};

export const determineTargetStage = (params: {
  trustScore: number;
  messageCount: number;
  daysTogether: number;
  unresolvedConflict: boolean;
}): RelationshipStage => {
  if (params.unresolvedConflict && params.trustScore < 0.55) {
    return 'acquaintance';
  }

  if (params.trustScore >= 0.9 && params.daysTogether >= 60 && params.messageCount >= 600) {
    return 'intimate';
  }

  if (params.trustScore >= 0.75 && params.daysTogether >= 30 && params.messageCount >= 250) {
    return 'close';
  }

  if (params.trustScore >= 0.55 && params.messageCount >= 80) {
    return 'friend';
  }

  if (params.trustScore >= 0.35 && params.messageCount >= 20) {
    return 'acquaintance';
  }

  return 'stranger';
};

export const createInitialRelationshipState = (
  style: AttachmentStyle = 'secure'
): RelationshipState => {
  return {
    stage: 'stranger',
    trustScore: 0.3,
    messageCount: 0,
    daysTogether: 1,
    unresolvedConflict: false,
    attachmentStyle: style,
    repairProgress: 0,
    seasonal: computeSeasonalState(0),
  };
};

const trustDeltaFromSignals = (
  interaction: RelationshipInteraction,
  state: RelationshipState
): number => {
  const positiveSignals = interaction.positiveSignals ?? 0;
  const negativeSignals = interaction.negativeSignals ?? 0;
  const profile = getAttachmentBehaviorProfile(state.attachmentStyle);

  const positiveDelta = positiveSignals * 0.015;
  const negativeDelta = negativeSignals * 0.02;

  const attachment = evaluateAttachmentImpact({
    style: state.attachmentStyle,
    silenceHours: interaction.silenceHours ?? 0,
    conflictActive: state.unresolvedConflict || Boolean(interaction.conflictTriggered),
  });

  const silencePenalty = attachment.silencePenalty;
  const conflictPenalty = attachment.conflictPenalty;

  const raw = positiveDelta - negativeDelta - silencePenalty - conflictPenalty;

  if (interaction.conflictTriggered) {
    return raw - profile.conflictEscalation * 0.08;
  }

  return raw;
};

export const updateRelationshipState = (
  previous: RelationshipState,
  interaction: RelationshipInteraction
): RelationshipState => {
  const messageCount = previous.messageCount + 1;
  const daysTogether = previous.daysTogether + Math.max(0, interaction.daysElapsed ?? 0);

  let next: RelationshipState = {
    ...previous,
    messageCount,
    daysTogether,
    seasonal: advanceSeasonalState(previous.seasonal, 1),
  };

  const trustDelta = trustDeltaFromSignals(interaction, next);
  next = {
    ...next,
    trustScore: clamp(next.trustScore + trustDelta, 0, 1),
  };

  if (interaction.conflictTriggered) {
    next = {
      ...next,
      unresolvedConflict: true,
      repairProgress: 0,
      trustScore: clamp(next.trustScore - 0.05, 0, 1),
    };
  }

  const repairActions = interaction.repairActions ?? [];
  if (repairActions.length > 0 || next.unresolvedConflict) {
    next = applyRepairMechanism(next, repairActions);
  }

  const targetStage = determineTargetStage({
    trustScore: next.trustScore,
    messageCount: next.messageCount,
    daysTogether: next.daysTogether,
    unresolvedConflict: next.unresolvedConflict,
  });

  return {
    ...next,
    stage: stepStage(next.stage, targetStage),
  };
};
