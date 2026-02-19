import { beforeEach, describe, expect, it } from 'vitest';
import type { PersonaTemplate } from '../types';
import {
  installTemplate,
  rateTemplate,
  recordTemplateUsage,
  reviewTemplateSubmissionDecision,
  submitTemplateContribution,
} from '../manager';
import { listRegistryCreatorLeaderboard, computeCreatorReputation } from '../reputationModel';
import { publishTemplateToRegistry, resetRegistryForTests } from '../registry';

const template: PersonaTemplate = {
  kind: 'persona',
  metadata: {
    id: 'persona-week59-reputation',
    name: 'Week59 Reputation Persona',
    description: 'Persona used for reputation signal tests.',
    category: 'engineering',
    tags: ['reputation', 'week59'],
    author: 'Week59 Creator',
    version: '1.0.0',
    createdAtIso: '2026-03-25T10:00:00.000Z',
    updatedAtIso: '2026-03-25T10:00:00.000Z',
  },
  personaYaml: `version: "1.0"
core:
  name: "Week59 Reputation Persona"
  essence: "Practical builder"
communication:
  tone: "direct"
  style: ["concise", "implementation-first"]
behavior:
  response_pacing: "fast"
boundaries:
  hard: ["No fabricated data"]`,
  summary: 'Week59 reputation test persona.',
};

describe('marketplace creator reputation model', () => {
  beforeEach(() => {
    resetRegistryForTests();
  });

  it('combines quality, installs, ratings, and registry consistency into a composite score', () => {
    const userId = 'week59-reputation-user';

    publishTemplateToRegistry({
      publisherUserId: userId,
      template,
      nowIso: '2026-03-25T10:00:00.000Z',
    });

    const submission = submitTemplateContribution({
      userId,
      template,
      submitterProfile: {
        displayName: 'Week59 Creator',
      },
    });

    reviewTemplateSubmissionDecision({
      userId,
      submissionId: submission.id,
      reviewerId: 'reviewer-week59',
      decision: 'approve',
      notes: 'Approved for quality baseline.',
    });

    installTemplate({ userId, templateId: template.metadata.id });
    recordTemplateUsage({ userId, templateId: template.metadata.id, incrementBy: 3 });
    rateTemplate({ userId, templateId: template.metadata.id, score: 5 });

    const reputation = computeCreatorReputation({ creatorUserId: userId });
    expect(reputation.signals.approvedTemplates).toBeGreaterThan(0);
    expect(reputation.signals.installCount).toBeGreaterThan(0);
    expect(reputation.signals.ratingAverage).toBeGreaterThan(0);
    expect(reputation.signals.registryPackages).toBeGreaterThan(0);
    expect(reputation.score).toBeGreaterThan(0);

    const leaderboard = listRegistryCreatorLeaderboard();
    expect(leaderboard.some((entry) => entry.creatorUserId === userId)).toBe(true);
  });
});
