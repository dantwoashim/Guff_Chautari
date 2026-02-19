import type { AshimPlugin } from './types';

export interface PluginConformanceResult {
  ok: boolean;
  errors: string[];
}

export const validatePluginConformance = (plugin: AshimPlugin): PluginConformanceResult => {
  const errors: string[] = [];

  if (!plugin.manifest.id || plugin.manifest.id.trim().length < 3) {
    errors.push('manifest.id must be at least 3 characters.');
  }

  if (!plugin.manifest.name || plugin.manifest.name.trim().length < 2) {
    errors.push('manifest.name is required.');
  }

  if (!plugin.manifest.version || !/^\d+\.\d+\.\d+$/.test(plugin.manifest.version)) {
    errors.push('manifest.version must follow semver (x.y.z).');
  }

  const panelIds = new Set<string>();
  for (const panel of plugin.panelDefinitions ?? []) {
    if (!panel.id.trim()) {
      errors.push('panel id cannot be empty.');
      continue;
    }

    if (panelIds.has(panel.id)) {
      errors.push(`duplicate panel id: ${panel.id}`);
      continue;
    }

    panelIds.add(panel.id);
  }

  const toolIds = new Set<string>();
  for (const tool of plugin.toolDefinitions ?? []) {
    if (!tool.id.trim()) {
      errors.push('tool id cannot be empty.');
      continue;
    }

    if (toolIds.has(tool.id)) {
      errors.push(`duplicate tool id: ${tool.id}`);
      continue;
    }

    toolIds.add(tool.id);
  }

  return {
    ok: errors.length === 0,
    errors,
  };
};
