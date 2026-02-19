import { describe, expect, it } from 'vitest';
import { searchKnowledgeSources } from '../../knowledge';
import { workflowEngine } from '../../workflows';
import { listInstalledTemplateIds } from '../manager';
import { installVerticalPack, listVerticalPacks, previewVerticalPack } from '../packs';

describe('marketplace vertical packs', () => {
  it('installs Founder OS and provisions persona + workflow + knowledge', () => {
    const userId = 'week59-pack-user';

    const result = installVerticalPack({
      userId,
      packId: 'founder_os',
      nowIso: '2026-03-24T09:00:00.000Z',
    });

    expect(result.ok).toBe(true);
    expect(result.installedTemplateIds).toEqual(
      expect.arrayContaining(['persona-coach', 'workflow-weekly-review'])
    );
    expect(result.installedWorkflowIds.length).toBe(1);
    expect(result.ingestedKnowledgeSourceIds.length).toBe(1);

    const installedTemplateIds = listInstalledTemplateIds(userId);
    expect(installedTemplateIds).toEqual(
      expect.arrayContaining(['persona-coach', 'workflow-weekly-review'])
    );

    const workflows = workflowEngine.listWorkflows(userId);
    expect(workflows.some((workflow) => workflow.id === result.installedWorkflowIds[0])).toBe(true);

    const knowledgeSources = searchKnowledgeSources({
      userId,
      term: 'Founder Operating Cadence',
    });
    expect(knowledgeSources.length).toBeGreaterThan(0);

    const preview = previewVerticalPack({
      userId,
      packId: 'founder_os',
    });
    expect(preview.ready).toBe(true);
  });

  it('ships legacy and vertical premium packs for marketplace distribution', () => {
    const packs = listVerticalPacks();
    expect(packs.length).toBeGreaterThanOrEqual(7);
    expect(packs.some((pack) => pack.id === 'founder_os')).toBe(true);
    expect(packs.some((pack) => pack.id === 'research_writing_lab')).toBe(true);
    expect(packs.some((pack) => pack.id === 'career_studio')).toBe(true);
    expect(packs.some((pack) => pack.id === 'health_habit_planning')).toBe(true);
    expect(packs.some((pack) => pack.id === 'student_os')).toBe(true);
    expect(packs.some((pack) => pack.id === 'engineering_lead_os')).toBe(true);
    expect(packs.some((pack) => pack.id === 'writers_studio_os')).toBe(true);
  });
});
