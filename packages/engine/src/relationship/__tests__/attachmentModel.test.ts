import { describe, expect, it } from 'vitest';
import { evaluateAttachmentImpact, getAttachmentBehaviorProfile } from '../attachmentModel';

describe('attachmentModel', () => {
  it('returns distinct behavior profiles by attachment style', () => {
    const anxious = getAttachmentBehaviorProfile('anxious');
    const avoidant = getAttachmentBehaviorProfile('avoidant');

    expect(anxious.silenceToleranceHours).toBeLessThan(avoidant.silenceToleranceHours);
    expect(anxious.conflictEscalation).toBeGreaterThan(avoidant.conflictEscalation);
  });

  it('drives silence and conflict penalties from style', () => {
    const anxiousImpact = evaluateAttachmentImpact({
      style: 'anxious',
      silenceHours: 12,
      conflictActive: true,
    });

    const avoidantImpact = evaluateAttachmentImpact({
      style: 'avoidant',
      silenceHours: 12,
      conflictActive: true,
    });

    expect(anxiousImpact.silencePenalty).toBeGreaterThan(avoidantImpact.silencePenalty);
    expect(anxiousImpact.conflictPenalty).toBeGreaterThan(avoidantImpact.conflictPenalty);
  });
});
