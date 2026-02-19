import { describe, expect, it } from 'vitest';
import type { PersonaTemplate } from '../types';
import {
  listTemplateSubmissions,
  listTemplates,
  reviewTemplateSubmissionDecision,
  submitTemplateContribution,
} from '../manager';

describe('marketplace submission + review pipeline', () => {
  it('submits template, reviews it, approves it, and exposes it in catalog', () => {
    const userId = 'market-week43-review-1';
    const template: PersonaTemplate = {
      kind: 'persona',
      metadata: {
        id: 'persona-week43-community-1',
        name: 'Community Systems Mentor',
        description: 'Community mentor persona for practical systems and execution.',
        category: 'engineering',
        tags: ['community', 'systems', 'mentor'],
        author: 'Community Builder',
        version: '1.0.0',
        createdAtIso: '2026-02-20T10:00:00.000Z',
        updatedAtIso: '2026-02-20T10:00:00.000Z',
      },
      personaYaml: `version: "1.0"
core:
  name: "Community Systems Mentor"
  essence: "Systems-first mentor persona"
communication:
  tone: "direct"
  style: ["practical", "measurable"]
behavior:
  response_pacing: "fast"
boundaries:
  hard: ["No hand-wavy recommendations"]`,
      summary: 'Pushes for measurable systems decisions and practical next actions.',
    };

    const submission = submitTemplateContribution({
      userId,
      template,
      submitterProfile: {
        displayName: 'Community Builder',
        creatorTier: 'Certified',
      },
    });

    expect(submission.status).toBe('community_review');
    expect(submission.submitterProfile.displayName).toBe('Community Builder');
    expect(submission.conformance.checks.length).toBeGreaterThan(0);
    expect(submission.qualityScore).toBeGreaterThan(0.6);

    const approved = reviewTemplateSubmissionDecision({
      userId,
      submissionId: submission.id,
      reviewerId: 'reviewer-1',
      decision: 'approve',
      notes: 'Good quality and structure.',
    });

    expect(approved.status).toBe('approved');
    expect(approved.reviewHistory).toHaveLength(1);
    expect(approved.reviewHistory[0].decision).toBe('approve');

    const visible = listTemplates({
      userId,
      kind: 'persona',
      author: 'Community Builder',
    });
    expect(visible.some((item) => item.metadata.id === template.metadata.id)).toBe(true);

    const stored = listTemplateSubmissions({
      userId,
      status: 'approved',
    });
    expect(stored.some((item) => item.id === submission.id)).toBe(true);
  });
});
