import { describe, expect, it } from 'vitest';
import type { PersonaTemplate } from '../types';
import { computeTemplateBadges } from '../badges';
import { reviewTemplateSubmissionDecision, submitTemplateContribution } from '../manager';

describe('marketplace badges', () => {
  it('computes benchmark/community/creator badges from submission and stats', () => {
    const userId = 'market-week43-badges-1';
    const template: PersonaTemplate = {
      kind: 'persona',
      metadata: {
        id: 'persona-badge-1',
        name: 'Badge Persona',
        description: 'Persona used to validate badge computation.',
        category: 'learning',
        tags: ['badge', 'community', 'verified'],
        author: 'Badge Author',
        version: '1.0.0',
        createdAtIso: '2026-02-20T11:00:00.000Z',
        updatedAtIso: '2026-02-20T11:00:00.000Z',
      },
      personaYaml: `version: "1.0"
core:
  name: "Badge Persona"
  essence: "Testing persona"
communication:
  tone: "clear"
  style: ["direct", "concrete"]
behavior:
  response_pacing: "fast"
boundaries:
  hard: ["No hallucinated facts"]`,
      summary: 'Badge testing persona.',
    };

    const submission = submitTemplateContribution({
      userId,
      template,
      submitterProfile: {
        displayName: 'Badge Author',
        creatorTier: 'Certified',
      },
    });

    const approved = reviewTemplateSubmissionDecision({
      userId,
      submissionId: submission.id,
      reviewerId: 'badge-reviewer',
      decision: 'approve',
    });

    const badges = computeTemplateBadges({
      template,
      submission: approved,
      stats: {
        installCount: 14,
        usageCount: 20,
        benchmarkVerified: true,
        creatorCertified: true,
        ashimCertified: true,
        certificationLevel: 'gold',
      },
      favoriteInstallThreshold: 10,
    });

    const badgeIds = badges.map((badge) => badge.id);
    expect(badgeIds).toContain('benchmark_verified');
    expect(badgeIds).toContain('community_favorite');
    expect(badgeIds).toContain('creator_certified');
    expect(badgeIds).toContain('ashim_certified');
  });
});
