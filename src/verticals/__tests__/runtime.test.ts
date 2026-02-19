import { describe, expect, it } from 'vitest';
import { careerVerticalConfig } from '../career/config';
import { founderVerticalConfig } from '../founder/config';
import { researchVerticalConfig } from '../research/config';
import { VerticalRuntime } from '../runtime';

describe('vertical runtime', () => {
  it('activates vertical config and exposes module/panel state', () => {
    const runtime = new VerticalRuntime();
    runtime.registerMany([founderVerticalConfig, researchVerticalConfig]);

    const activation = runtime.activate({
      workspaceId: 'workspace-1',
      userId: 'owner-1',
      verticalId: 'founder_os',
      nowIso: '2026-02-18T10:00:00.000Z',
    });

    expect(activation.verticalId).toBe('founder_os');
    expect(activation.modules.some((module) => module.type === 'persona')).toBe(true);
    expect(activation.modules.filter((module) => module.type === 'workflow').length).toBeGreaterThanOrEqual(4);
    expect(activation.panelIds).toContain('founder_dashboard');
    expect(activation.knowledgeNamespaces.every((namespace) => namespace.startsWith('vertical.founder_os.knowledge.'))).toBe(true);
    expect(activation.searchableNamespaces).toContain('workspace.workspace_1.personal');

    const active = runtime.getActive('workspace-1');
    expect(active?.verticalId).toBe('founder_os');
    expect(runtime.isPanelEnabled({ workspaceId: 'workspace-1', panelId: 'founder_dashboard' })).toBe(true);
  });

  it('supports switching/deactivating vertical assignments by workspace', () => {
    const runtime = new VerticalRuntime();
    runtime.registerMany([founderVerticalConfig, researchVerticalConfig]);

    runtime.activate({
      workspaceId: 'workspace-2',
      userId: 'owner-2',
      verticalId: 'founder_os',
      nowIso: '2026-02-18T11:00:00.000Z',
    });

    const switched = runtime.activate({
      workspaceId: 'workspace-2',
      userId: 'owner-2',
      verticalId: 'research_writing_lab',
      nowIso: '2026-02-18T11:05:00.000Z',
    });

    expect(switched.verticalId).toBe('research_writing_lab');
    expect(switched.panelIds).toContain('research_dashboard');
    expect(switched.panelIds).not.toContain('founder_dashboard');
    expect(switched.searchableNamespaces.some((namespace) => namespace.startsWith('vertical.founder_os.knowledge.'))).toBe(true);
    expect(switched.searchableNamespaces.some((namespace) => namespace.startsWith('vertical.research_writing_lab.knowledge.'))).toBe(true);
    expect(runtime.listActivationHistory('workspace-2').length).toBe(2);

    runtime.deactivate('workspace-2');
    expect(runtime.getActive('workspace-2')).toBeNull();
    expect(runtime.listSearchableNamespaces('workspace-2').length).toBeGreaterThan(0);
  });

  it('registers and activates custom vertical configs with validation', () => {
    const runtime = new VerticalRuntime();
    runtime.registerMany([founderVerticalConfig, researchVerticalConfig, careerVerticalConfig]);

    const custom = runtime.registerCustom({
      ...careerVerticalConfig,
      id: 'community_focus_sprint',
      name: 'Community Focus Sprint',
      source: 'community',
      createdByUserId: 'creator-1',
    });

    expect(custom.source).toBe('community');
    expect(runtime.listCustomConfigs().some((config) => config.id === 'community_focus_sprint')).toBe(true);

    const activation = runtime.activate({
      workspaceId: 'workspace-community',
      userId: 'owner-community',
      verticalId: 'community_focus_sprint',
      nowIso: '2026-02-18T13:00:00.000Z',
    });

    expect(activation.verticalId).toBe('community_focus_sprint');
    expect(activation.panelIds).toContain('career_dashboard');
  });
});
