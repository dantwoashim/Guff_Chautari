import type { AttachmentBehaviorProfile, AttachmentStyle } from './types';

const profiles: Record<AttachmentStyle, AttachmentBehaviorProfile> = {
  anxious: {
    silenceToleranceHours: 4,
    reassuranceNeed: 0.85,
    conflictEscalation: 0.8,
    repairResponsiveness: 0.7,
    conflictStyle: 'pursue',
  },
  avoidant: {
    silenceToleranceHours: 18,
    reassuranceNeed: 0.25,
    conflictEscalation: 0.3,
    repairResponsiveness: 0.4,
    conflictStyle: 'withdraw',
  },
  secure: {
    silenceToleranceHours: 12,
    reassuranceNeed: 0.45,
    conflictEscalation: 0.45,
    repairResponsiveness: 0.8,
    conflictStyle: 'balanced',
  },
  disorganized: {
    silenceToleranceHours: 6,
    reassuranceNeed: 0.75,
    conflictEscalation: 0.9,
    repairResponsiveness: 0.35,
    conflictStyle: 'volatile',
  },
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

export const getAttachmentBehaviorProfile = (style: AttachmentStyle): AttachmentBehaviorProfile => {
  return profiles[style];
};

export const evaluateAttachmentImpact = (params: {
  style: AttachmentStyle;
  silenceHours: number;
  conflictActive: boolean;
}): {
  silencePenalty: number;
  conflictPenalty: number;
  explanation: string;
} => {
  const profile = getAttachmentBehaviorProfile(params.style);

  const silenceOverage = Math.max(0, params.silenceHours - profile.silenceToleranceHours);
  const silencePenalty = clamp((silenceOverage / 24) * profile.reassuranceNeed, 0, 0.25);
  const conflictPenalty = params.conflictActive ? profile.conflictEscalation * 0.12 : 0;

  return {
    silencePenalty,
    conflictPenalty,
    explanation: `style=${params.style} silence_overage=${silenceOverage.toFixed(2)}h conflict=${params.conflictActive}`,
  };
};
