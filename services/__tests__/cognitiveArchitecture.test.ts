import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  accumulateEmotionalDebt,
  applyAttentionFilter,
  calculateDebtDischarge,
  generateDifferentialPrompt,
  generateNextDelay,
  initializeDefaultManifold,
  initializeEmotionalDebt,
  initializeTimingModel,
  splitPersonaIntoDifferential,
} from '../cognitiveArchitecture';

describe('cognitiveArchitecture', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('splits persona prompt into differential cache', () => {
    const cache = splitPersonaIntoDifferential(
      'Identity: calm and thoughtful\nNever lie.\nAlways be honest.',
      {
        core: { name: 'Asha' },
        communication: { signaturePhrases: ['hmm', 'fair point'] },
      }
    );

    expect(cache.immutableCore.name).toBe('Asha');
    expect(cache.mutableState.currentMood).toBe('neutral');
    expect(cache.sessionId).toBeTruthy();
  });

  it('generates first-message prompt with immutable core block', () => {
    const cache = splitPersonaIntoDifferential('Identity: curious', {
      core: { name: 'Nova' },
      communication: { signaturePhrases: [] },
    });
    const prompt = generateDifferentialPrompt(cache, true);
    expect(prompt).toContain('PERSONA IDENTITY - IMMUTABLE CORE');
    expect(prompt).toContain('Name: Nova');
  });

  it('produces bounded delay updates from timing model', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const model = initializeTimingModel();
    const next = generateNextDelay(model);

    expect(next.delay).toBeGreaterThanOrEqual(200);
    expect(next.delay).toBeLessThanOrEqual(5000);
    expect(next.model.currentMean).toBeGreaterThanOrEqual(800);
  });

  it('returns processed and missed segments under attention constraints', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const attention = applyAttentionFilter(
      'I feel upset. Also, I have two deadlines this week. Can you help me plan?',
      { currentCapacity: 0.3, emotionalBias: 0.5, currentMood: 'normal' }
    );

    expect(attention.processedSegments.length).toBeGreaterThan(0);
    expect(attention.missedSegments.length).toBeGreaterThan(0);
  });

  it('accumulates emotional debt and triggers discharge above threshold', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const debt = initializeEmotionalDebt();
    accumulateEmotionalDebt(debt, {
      type: 'frustration',
      amount: 1.2,
      source: 'ignored message',
    });

    const discharge = calculateDebtDischarge(debt);

    expect(discharge.totalDebt).toBeGreaterThan(0.7);
    expect(discharge.shouldDischarge).toBe(true);
    expect(discharge.dischargeType).toBe('frustration');
  });

  it('initializes manifold with multiple self variants', () => {
    const manifold = initializeDefaultManifold();
    expect(manifold.morningself.verbosity).toBeLessThan(0);
    expect(manifold.excitedSelf.playfulness).toBeGreaterThan(0);
  });
});
