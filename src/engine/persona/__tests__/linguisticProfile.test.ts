import { describe, expect, it } from 'vitest';
import {
  createDefaultSociolinguisticProfile,
  resolveRegisterByTopic,
  summarizeLinguisticProfile,
} from '../linguisticProfile';

describe('linguisticProfile', () => {
  it('creates a default profile and resolves topic register', () => {
    const profile = createDefaultSociolinguisticProfile('persona-1', 'balanced');

    expect(profile.id).toContain('persona-1');
    expect(profile.codeSwitchRules.length).toBeGreaterThan(0);

    const register = resolveRegisterByTopic(profile, 'Can you explain the decision tradeoff and launch plan?');
    expect(register).toBe('formal');
  });

  it('summarizes consistency hints for prompt injection', () => {
    const profile = createDefaultSociolinguisticProfile('persona-2', 'casual');
    const summary = summarizeLinguisticProfile(profile);

    expect(summary.consistencyHints.length).toBeGreaterThanOrEqual(3);
    expect(summary.profileSummary).toContain('register=');
  });
});
