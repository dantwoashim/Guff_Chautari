import { beforeEach, describe, expect, it } from 'vitest';
import type { PersonaTemplate } from '../../marketplace';
import { listCreatorReviewQueueWithAttribution } from '../reviewWorkflow';
import {
  createCollaborativeCreatorPack,
  getCollaborativeSubmissionAttribution,
  listCollaborativeCreatorPacks,
  resetCreatorCollaborationForTests,
  submitCollaborativeTemplateForReview,
} from '../collaboration';

const buildTemplate = (id: string): PersonaTemplate => ({
  kind: 'persona',
  metadata: {
    id,
    name: 'Collaborative Growth Template',
    description: 'Co-authored creator template designed for collaborative review flow tests.',
    category: 'operations',
    tags: ['collaboration', 'creator'],
    author: 'Collective',
    version: '1.0.0',
    createdAtIso: '2026-02-18T00:00:00.000Z',
    updatedAtIso: '2026-02-18T00:00:00.000Z',
  },
  personaYaml: `version: "1.0"
core:
  name: "Collaborative Growth Template"
  essence: "behavior and communication boundaries for collaborative template authoring and review quality control."
style:
  tone: "direct"
  constraints:
    - "communication consistency"
    - "behavior traceability"
    - "boundaries clarity"
`,
  summary: 'Co-authored template',
});

describe('creator collaboration', () => {
  beforeEach(() => {
    resetCreatorCollaborationForTests();
  });

  it('supports multi-author submission attribution in review workflow', () => {
    const userId = 'week64-collaboration-owner';
    const pack = createCollaborativeCreatorPack({
      packId: 'growth-pack-collab',
      name: 'Growth Pack Collaborative',
      description: 'Pack co-authored by two creators.',
      primaryCreatorUserId: 'creator-primary',
      primaryDisplayName: 'Primary Creator',
      contributors: [
        {
          creatorUserId: 'creator-coauthor',
          displayName: 'Co Author',
          roleLabel: 'co_author',
        },
      ],
    });

    expect(pack.attribution.map((member) => `${member.creatorUserId}:${member.roleLabel}`)).toEqual([
      'creator-primary:primary_author',
      'creator-coauthor:co_author',
    ]);

    const submissionResult = submitCollaborativeTemplateForReview({
      userId,
      packId: pack.id,
      template: buildTemplate('growth-pack-coauthored-template'),
    });

    expect(submissionResult.submission.status).toBe('community_review');
    expect(
      submissionResult.attribution.map((member) => `${member.creatorUserId}:${member.roleLabel}`)
    ).toEqual(['creator-primary:primary_author', 'creator-coauthor:co_author']);

    const queue = listCreatorReviewQueueWithAttribution({
      userId,
      status: 'community_review',
    });
    const queuedSubmission = queue.find((entry) => entry.id === submissionResult.submission.id);
    expect(queuedSubmission).toBeDefined();
    expect(
      queuedSubmission?.attribution?.map((member) => `${member.creatorUserId}:${member.roleLabel}`)
    ).toEqual(['creator-primary:primary_author', 'creator-coauthor:co_author']);

    const directAttribution = getCollaborativeSubmissionAttribution({
      submissionId: submissionResult.submission.id,
    });
    expect(directAttribution?.map((member) => member.creatorUserId)).toEqual([
      'creator-primary',
      'creator-coauthor',
    ]);

    const coAuthorPacks = listCollaborativeCreatorPacks({
      creatorUserId: 'creator-coauthor',
    });
    expect(coAuthorPacks.map((entry) => entry.id)).toContain(pack.id);
  });
});
