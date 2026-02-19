import { describe, expect, it } from 'vitest';
import type { PersonaTemplate } from '../types';
import {
  installTemplate,
  listTemplates,
  rateTemplate,
  recordTemplateUsage,
  reviewTemplateSubmissionDecision,
  submitTemplateContribution,
} from '../manager';

const makeTemplate = (payload: {
  id: string;
  name: string;
  category: PersonaTemplate['metadata']['category'];
  tags: string[];
  author: string;
  createdAtIso: string;
  featured?: boolean;
}): PersonaTemplate => {
  return {
    kind: 'persona',
    metadata: {
      id: payload.id,
      name: payload.name,
      description: `${payload.name} template description for marketplace filtering and ranking.`,
      category: payload.category,
      tags: payload.tags,
      author: payload.author,
      version: '1.0.0',
      createdAtIso: payload.createdAtIso,
      updatedAtIso: payload.createdAtIso,
      featured: payload.featured,
    },
    personaYaml: `version: "1.0"
core:
  name: "${payload.name}"
  essence: "Template essence"
communication:
  tone: "clear"
  style: ["structured", "practical"]
behavior:
  response_pacing: "fast"
boundaries:
  hard: ["No fabricated data"]`,
    summary: `${payload.name} summary.`,
  };
};

describe('marketplace catalog merge/sort/filter', () => {
  it('sorts featured first, then highest-rated, then newest and supports query filters', () => {
    const userId = 'market-week43-sort-1';
    const author = 'Sort Tester';

    const featured = makeTemplate({
      id: 'persona-sort-featured',
      name: 'Featured Template',
      category: 'creative',
      tags: ['community', 'ux'],
      author,
      createdAtIso: '2026-02-01T09:00:00.000Z',
      featured: true,
    });

    const highRated = makeTemplate({
      id: 'persona-sort-high-rated',
      name: 'High Rated Template',
      category: 'creative',
      tags: ['community', 'ux'],
      author,
      createdAtIso: '2026-02-02T09:00:00.000Z',
    });

    const newest = makeTemplate({
      id: 'persona-sort-newest',
      name: 'Newest Template',
      category: 'creative',
      tags: ['community', 'design'],
      author,
      createdAtIso: '2026-02-03T09:00:00.000Z',
    });

    const submissions = [featured, highRated, newest].map((template) =>
      submitTemplateContribution({
        userId,
        template,
        submitterProfile: {
          displayName: author,
        },
      })
    );

    for (const submission of submissions) {
      reviewTemplateSubmissionDecision({
        userId,
        submissionId: submission.id,
        reviewerId: 'reviewer-sort',
        decision: 'approve',
      });
    }

    installTemplate({ userId, templateId: highRated.metadata.id });
    recordTemplateUsage({ userId, templateId: highRated.metadata.id, incrementBy: 3 });

    installTemplate({ userId, templateId: newest.metadata.id });
    recordTemplateUsage({ userId, templateId: newest.metadata.id, incrementBy: 3 });

    rateTemplate({ userId, templateId: highRated.metadata.id, score: 5 });
    rateTemplate({ userId, templateId: highRated.metadata.id, score: 5 });
    rateTemplate({ userId, templateId: newest.metadata.id, score: 3 });

    const sorted = listTemplates({
      userId,
      kind: 'persona',
      author,
      category: 'creative',
    });

    const ids = sorted.map((item) => item.metadata.id);
    expect(ids.indexOf(featured.metadata.id)).toBe(0);
    expect(ids.indexOf(highRated.metadata.id)).toBeLessThan(ids.indexOf(newest.metadata.id));

    const tagFiltered = listTemplates({
      userId,
      kind: 'persona',
      author,
      tags: ['ux'],
    });
    expect(tagFiltered.every((item) => item.metadata.tags.includes('ux'))).toBe(true);
    expect(tagFiltered.some((item) => item.metadata.id === newest.metadata.id)).toBe(false);

    const searchFiltered = listTemplates({
      userId,
      kind: 'persona',
      author,
      search: 'newest',
    });
    expect(searchFiltered).toHaveLength(1);
    expect(searchFiltered[0].metadata.id).toBe(newest.metadata.id);
  });
});
