import { describe, expect, it } from 'vitest';
import type { PersonaTemplate } from '../types';
import {
  getTemplateBadges,
  getTemplateCommunityStats,
  listTemplates,
  reviewTemplateSubmissionDecision,
  submitTemplateContribution,
} from '../manager';

const makeTemplate = (payload: {
  id: string;
  name: string;
  createdAtIso: string;
}): PersonaTemplate => ({
  kind: 'persona',
  metadata: {
    id: payload.id,
    name: payload.name,
    description: `${payload.name} template description designed for certification placement tests.`,
    category: 'operations',
    tags: ['certification', 'placement', 'quality'],
    author: 'Certification QA',
    version: '1.0.0',
    createdAtIso: payload.createdAtIso,
    updatedAtIso: payload.createdAtIso,
    featured: false,
  },
  personaYaml: `version: "1.0"
core:
  name: "${payload.name}"
  essence: "Certified persona"
communication:
  tone: "clear"
  style: ["practical", "focused"]
behavior:
  response_pacing: "fast"
boundaries:
  hard: ["No fabricated claims"]`,
  summary: `${payload.name} summary`,
});

describe('marketplace certification placement', () => {
  it('adds Ashim Certified badge and prioritizes certified entries in ranking', () => {
    const userId = 'week79-cert-placement';

    const certifiedTemplate = makeTemplate({
      id: 'persona-cert-ranked',
      name: 'Certified Ranked Persona',
      createdAtIso: '2026-10-14T09:00:00.000Z',
    });

    const uncertifiedTemplate = makeTemplate({
      id: 'persona-uncert-ranked',
      name: 'Uncertified Ranked Persona',
      createdAtIso: '2026-10-14T09:00:00.000Z',
    });

    const certifiedSubmission = submitTemplateContribution({
      userId,
      template: certifiedTemplate,
      submitterProfile: {
        displayName: 'Certified Creator',
        creatorTier: 'Certified',
      },
    });

    const uncertifiedSubmission = submitTemplateContribution({
      userId,
      template: uncertifiedTemplate,
      submitterProfile: {
        displayName: 'New Creator',
      },
    });

    reviewTemplateSubmissionDecision({
      userId,
      submissionId: certifiedSubmission.id,
      reviewerId: 'mod-1',
      decision: 'approve',
      nowIso: '2026-10-14T11:00:00.000Z',
    });

    reviewTemplateSubmissionDecision({
      userId,
      submissionId: uncertifiedSubmission.id,
      reviewerId: 'mod-1',
      decision: 'approve',
      nowIso: '2026-10-14T11:00:00.000Z',
    });

    const certifiedStats = getTemplateCommunityStats({
      userId,
      templateId: certifiedTemplate.metadata.id,
    });
    const uncertifiedStats = getTemplateCommunityStats({
      userId,
      templateId: uncertifiedTemplate.metadata.id,
    });

    expect(certifiedStats?.ashimCertified).toBe(true);
    expect(uncertifiedStats?.ashimCertified).toBe(false);

    const certifiedBadges = getTemplateBadges({
      userId,
      templateId: certifiedTemplate.metadata.id,
    });
    expect(certifiedBadges.some((badge) => badge.id === 'ashim_certified')).toBe(true);

    const sorted = listTemplates({
      userId,
      kind: 'persona',
      author: 'Certification QA',
      search: 'ranked persona',
    });

    const ids = sorted.map((entry) => entry.metadata.id);
    expect(ids.indexOf(certifiedTemplate.metadata.id)).toBeLessThan(
      ids.indexOf(uncertifiedTemplate.metadata.id)
    );
  });
});
