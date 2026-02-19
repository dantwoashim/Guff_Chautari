import { describe, expect, it } from 'vitest';
import type { PersonaTemplate } from '../../marketplace';
import { submitTemplateContribution, voteOnSubmission } from '../../marketplace';
import { buildCreatorProfile } from '../profile';

describe('creator profile', () => {
  it('builds creator profile from submission and benchmark signals', () => {
    const userId = 'creator-user-1';
    const template: PersonaTemplate = {
      kind: 'persona',
      metadata: {
        id: 'creator-template-1',
        name: 'Creator Template',
        description: 'Template for creator profile test',
        category: 'creative',
        tags: ['creator'],
        author: 'Creator',
        version: '1.0.0',
        createdAtIso: new Date().toISOString(),
        updatedAtIso: new Date().toISOString(),
      },
      personaYaml: `version: "1.0"
core:
  name: "Creator Template"
  essence: "Test template"`,
      summary: 'Test summary',
    };

    const submission = submitTemplateContribution({
      userId,
      template,
    });

    voteOnSubmission({ userId, submissionId: submission.id, vote: 'up' });
    voteOnSubmission({ userId, submissionId: submission.id, vote: 'up' });
    voteOnSubmission({ userId, submissionId: submission.id, vote: 'up' });

    const profile = buildCreatorProfile(userId);
    expect(profile.approvedTemplates).toBeGreaterThanOrEqual(1);
    expect(profile.currentTier).toBe('Contributor');
  });
});
