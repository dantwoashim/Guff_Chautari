import { describe, expect, it } from 'vitest';
import { buildCodeSwitchDecision } from '../codeSwitcher';
import { createDefaultSociolinguisticProfile } from '../linguisticProfile';

describe('codeSwitcher', () => {
  it('switches to formal register for strategic or planning prompts', () => {
    const profile = createDefaultSociolinguisticProfile('persona-x', 'casual');
    const result = buildCodeSwitchDecision(
      profile,
      'Please explain the roadmap tradeoff and launch strategy.'
    );

    expect(result.register).toBe('formal');
    expect(result.directive.toLowerCase()).toContain('precise');
  });

  it('switches to playful register when humor cues are present', () => {
    const profile = createDefaultSociolinguisticProfile('persona-x', 'balanced');
    const result = buildCodeSwitchDecision(profile, 'lol roast my old TODO list');

    expect(result.register).toBe('playful');
    expect(result.reasons.length).toBeGreaterThan(0);
  });
});
