import { describe, expect, it } from 'vitest';
import type { LivingPersona } from '../../../types';
import { createPersonaTtsConfig } from '../ttsEngine';

const makePersona = (payload: {
  defaultMood: string;
  energyLevel: string;
  warmthLevel: number;
  directnessLevel: number;
  communicationTone?: string;
}): LivingPersona => ({
  id: 'persona-1',
  version: '1',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  core: {
    name: 'Test Persona',
    essenceDescription: 'Test persona',
    emotionalBaseline: {
      defaultMood: payload.defaultMood,
      energyLevel: payload.energyLevel,
      warmthLevel: payload.warmthLevel,
      directnessLevel: payload.directnessLevel,
    },
  },
  communication: payload.communicationTone
    ? {
        tone: payload.communicationTone,
      }
    : {},
  behavior: {},
  context: {},
  compiledPrompt: 'Respond naturally.',
  confidenceScore: 0.9,
});

describe('persona matched tts config', () => {
  it('maps warm persona tone to lower pitch and slower speaking rate', () => {
    const warmPersona = makePersona({
      defaultMood: 'warm',
      energyLevel: 'low',
      warmthLevel: 0.9,
      directnessLevel: 0.3,
      communicationTone: 'warm',
    });

    const config = createPersonaTtsConfig({
      persona: warmPersona,
      voiceName: 'Kore',
    });

    expect(config.emotionalTone).toBe('warm');
    expect(config.pitch).toBeLessThan(1);
    expect(config.speakingRate).toBeLessThan(1);
    expect(config.pauseMs).toBeGreaterThan(220);
    expect(config.voiceName).toBe('Kore');
    expect(config.geminiAffect.style).toBe('warm');
  });

  it('maps high-energy persona to faster speaking rate', () => {
    const energeticPersona = makePersona({
      defaultMood: 'focused',
      energyLevel: 'high',
      warmthLevel: 0.4,
      directnessLevel: 0.8,
      communicationTone: 'energetic',
    });

    const config = createPersonaTtsConfig({
      persona: energeticPersona,
    });

    expect(config.emotionalTone).toBe('energetic');
    expect(config.speakingRate).toBeGreaterThan(1);
    expect(config.pauseMs).toBeLessThan(220);
  });
});
