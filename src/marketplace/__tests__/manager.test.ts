import { describe, expect, it } from 'vitest';
import { workflowEngine } from '../../workflows';
import type { PersonaTemplate } from '../types';
import {
  getTemplateCommunityStats,
  getTemplateRating,
  getTemplateById,
  installTemplate,
  listInstalledTemplateIds,
  listTemplateReviews,
  listTemplates,
  rateTemplate,
  recordTemplateUsage,
  submitTemplateContribution,
  voteOnSubmission,
} from '../manager';

describe('marketplace manager', () => {
  it('installs workflow templates and creates runnable workflows', () => {
    const userId = 'market-user-1';
    const template = getTemplateById({
      userId,
      templateId: 'workflow-daily-email-summary',
    });
    expect(template?.kind).toBe('workflow');

    const install = installTemplate({
      userId,
      templateId: 'workflow-daily-email-summary',
    });

    expect(install.ok).toBe(true);
    expect(install.installedWorkflowId).toBeDefined();

    const workflows = workflowEngine.listWorkflows(userId);
    expect(workflows.some((workflow) => workflow.id === install.installedWorkflowId)).toBe(true);
    expect(listInstalledTemplateIds(userId)).toContain('workflow-daily-email-summary');
  });

  it('moves community-reviewed templates to approved after vote threshold', () => {
    const userId = 'market-user-2';
    const template: PersonaTemplate = {
      kind: 'persona',
      metadata: {
        id: 'persona-community-1',
        name: 'Community Persona',
        description: 'Community submitted persona template',
        category: 'creative',
        tags: ['community', 'creative'],
        author: 'Community Builder',
        version: '1.0.0',
        createdAtIso: new Date().toISOString(),
        updatedAtIso: new Date().toISOString(),
      },
      personaYaml: `version: "1.0"
core:
  name: "Community Persona"
  essence: "Inventive collaborator"`,
      summary: 'Community-created collaborator persona.',
    };

    const submission = submitTemplateContribution({
      userId,
      template,
    });

    expect(submission.status).toBe('community_review');

    const afterVote1 = voteOnSubmission({
      userId,
      submissionId: submission.id,
      vote: 'up',
    });
    expect(afterVote1.status).toBe('community_review');

    voteOnSubmission({
      userId,
      submissionId: submission.id,
      vote: 'up',
    });
    const afterVote3 = voteOnSubmission({
      userId,
      submissionId: submission.id,
      vote: 'up',
    });

    expect(afterVote3.status).toBe('approved');

    const templates = listTemplates({
      userId,
      kind: 'persona',
    });
    expect(templates.some((item) => item.metadata.id === 'persona-community-1')).toBe(true);
  });

  it('requires 3+ uses before rating and persists optional text review', () => {
    const userId = 'market-user-3';
    const templateId = 'workflow-daily-email-summary';

    const installResult = installTemplate({
      userId,
      templateId,
    });
    expect(installResult.ok).toBe(true);

    expect(() =>
      rateTemplate({
        userId,
        templateId,
        score: 5,
        reviewText: 'Great template.',
      })
    ).toThrow('You can rate this template after at least 3 uses.');

    recordTemplateUsage({
      userId,
      templateId,
      incrementBy: 3,
    });

    const rating = rateTemplate({
      userId,
      templateId,
      score: 4,
      reviewText: 'Solid baseline for daily planning.',
    });

    expect(rating.average).toBe(4);
    expect(rating.votes).toBe(1);

    const storedRating = getTemplateRating({
      userId,
      templateId,
    });
    expect(storedRating?.average).toBe(4);
    expect(storedRating?.votes).toBe(1);

    const reviews = listTemplateReviews({
      userId,
      templateId,
    });
    expect(reviews).toHaveLength(1);
    expect(reviews[0].text).toBe('Solid baseline for daily planning.');
    expect(reviews[0].usageCountAtReview).toBeGreaterThanOrEqual(3);

    const stats = getTemplateCommunityStats({
      userId,
      templateId,
    });
    expect(stats?.usageCount).toBe(3);
  });
});
