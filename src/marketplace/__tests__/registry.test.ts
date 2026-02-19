import { beforeEach, describe, expect, it } from 'vitest';
import type { PersonaTemplate } from '../types';
import {
  getRegistryPackage,
  listRegistryPackages,
  publishTemplateToRegistry,
  resetRegistryForTests,
} from '../registry';
import { listTemplates } from '../manager';

const makePersonaTemplate = (payload: {
  id: string;
  name: string;
  version: string;
  createdAtIso: string;
  updatedAtIso: string;
  descriptionSuffix: string;
}): PersonaTemplate => ({
  kind: 'persona',
  metadata: {
    id: payload.id,
    name: payload.name,
    description: `Registry template ${payload.descriptionSuffix}`,
    category: 'engineering',
    tags: ['registry', 'week59'],
    author: 'Registry Creator',
    version: payload.version,
    createdAtIso: payload.createdAtIso,
    updatedAtIso: payload.updatedAtIso,
    featured: false,
  },
  personaYaml: `version: "1.0"
core:
  name: "${payload.name}"
  essence: "Registry persona"
communication:
  tone: "direct"
  style: ["clear", "practical"]
behavior:
  response_pacing: "fast"
boundaries:
  hard: ["No fabricated facts"]`,
  summary: `Summary for ${payload.name}`,
});

describe('marketplace registry', () => {
  beforeEach(() => {
    resetRegistryForTests();
  });

  it('publishes v1 then v2, auto-deprecates v1, and catalog resolves v2', () => {
    const userId = 'week59-registry-user';
    const templateId = 'persona-week59-registry';

    const v1 = makePersonaTemplate({
      id: templateId,
      name: 'Week59 Registry Persona',
      version: '1.0.0',
      createdAtIso: '2026-03-20T10:00:00.000Z',
      updatedAtIso: '2026-03-20T10:00:00.000Z',
      descriptionSuffix: 'v1',
    });

    const publishedV1 = publishTemplateToRegistry({
      publisherUserId: userId,
      template: v1,
      nowIso: '2026-03-20T10:00:00.000Z',
    });
    expect(publishedV1.entry.status).toBe('active');

    const v2 = makePersonaTemplate({
      id: templateId,
      name: 'Week59 Registry Persona',
      version: '1.1.0',
      createdAtIso: '2026-03-21T10:00:00.000Z',
      updatedAtIso: '2026-03-21T10:00:00.000Z',
      descriptionSuffix: 'v2',
    });

    const publishedV2 = publishTemplateToRegistry({
      publisherUserId: userId,
      template: v2,
      nowIso: '2026-03-21T10:00:00.000Z',
    });

    expect(publishedV2.entry.status).toBe('active');
    expect(publishedV2.deprecatedVersions).toContain('1.0.0');

    const allVersions = listRegistryPackages({
      templateId,
      includeDeprecated: true,
    });
    expect(allVersions).toHaveLength(2);
    expect(allVersions.find((entry) => entry.version === '1.0.0')?.status).toBe('deprecated');
    expect(allVersions.find((entry) => entry.version === '1.1.0')?.status).toBe('active');

    const latestActive = getRegistryPackage({
      templateId,
      includeDeprecated: false,
    });
    expect(latestActive?.version).toBe('1.1.0');

    const catalog = listTemplates({
      userId,
      kind: 'persona',
      search: 'Week59 Registry Persona',
    });
    const resolved = catalog.find((template) => template.metadata.id === templateId);
    expect(resolved?.metadata.version).toBe('1.1.0');
  });

  it('dedupes exact republish of same template version', () => {
    const userId = 'week59-registry-user-dedupe';
    const template = makePersonaTemplate({
      id: 'persona-week59-registry-dedupe',
      name: 'Week59 Dedupe Persona',
      version: '2.0.0',
      createdAtIso: '2026-03-22T10:00:00.000Z',
      updatedAtIso: '2026-03-22T10:00:00.000Z',
      descriptionSuffix: 'dedupe',
    });

    const first = publishTemplateToRegistry({
      publisherUserId: userId,
      template,
      nowIso: '2026-03-22T10:00:00.000Z',
    });
    expect(first.deduped).toBe(false);

    const second = publishTemplateToRegistry({
      publisherUserId: userId,
      template,
      nowIso: '2026-03-22T11:00:00.000Z',
    });
    expect(second.deduped).toBe(true);

    const versions = listRegistryPackages({
      templateId: template.metadata.id,
      includeDeprecated: true,
    });
    expect(versions).toHaveLength(1);
  });
});
