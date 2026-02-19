import { describe, expect, it } from 'vitest';
import {
  clearPluginEvents,
  ensureReferencePluginsInstalled,
  getPluginPermissionState,
  installReferencePlugin,
  invokePluginTool,
  listInstalledPlugins,
  listPluginEvents,
  listPluginPanels,
  listReferencePluginConformance,
  reloadInstalledPlugin,
  renderInstalledPluginPanel,
  uninstallInstalledPlugin,
  updatePluginPermissions,
} from '../runtime';

describe('plugin runtime', () => {
  it('installs reference plugin and renders panel output', async () => {
    await ensureReferencePluginsInstalled('plugin-user-1');
    const plugins = listInstalledPlugins();
    expect(plugins.length).toBeGreaterThan(0);

    const panels = listPluginPanels();
    expect(panels.length).toBeGreaterThan(0);

    const rendered = renderInstalledPluginPanel({
      userId: 'plugin-user-1',
      pluginId: panels[0].pluginId,
      panelId: panels[0].panel.id,
    });

    expect(rendered).not.toBeNull();
  });

  it('invokes read plugin tool and escalates mutation tool by policy', async () => {
    await ensureReferencePluginsInstalled('plugin-user-2');

    const readOutcome = await invokePluginTool({
      userId: 'plugin-user-2',
      pluginId: 'pomodoro',
      toolId: 'get_focus_stats',
      toolPayload: {},
    });

    expect(readOutcome.decision.decision).toBe('allow');
    expect(readOutcome.result?.ok).toBe(true);

    const mutationOutcome = await invokePluginTool({
      userId: 'plugin-user-2',
      pluginId: 'pomodoro',
      toolId: 'reset_focus_sessions',
      toolPayload: {},
    });

    expect(mutationOutcome.decision.decision).toBe('escalate');
    expect(mutationOutcome.result).toBeUndefined();
  });

  it('blocks tool execution when tools.execute permission is denied and allows after update', async () => {
    const userId = 'plugin-user-3';
    await installReferencePlugin({
      userId,
      pluginId: 'pomodoro',
      approvedPermissions: ['storage.read', 'storage.write', 'notifications.write', 'activity.write'],
    });

    const denied = await invokePluginTool({
      userId,
      pluginId: 'pomodoro',
      toolId: 'get_focus_stats',
      toolPayload: {},
    });

    expect(denied.decision.decision).toBe('deny');
    expect(denied.decision.reason).toContain('permission_denied');

    await updatePluginPermissions({
      userId,
      pluginId: 'pomodoro',
      approvedPermissions: [
        'storage.read',
        'storage.write',
        'notifications.write',
        'activity.write',
        'tools.execute',
      ],
    });

    const allowed = await invokePluginTool({
      userId,
      pluginId: 'pomodoro',
      toolId: 'get_focus_stats',
      toolPayload: {},
    });

    expect(allowed.decision.decision).toBe('allow');
    expect(allowed.result?.ok).toBe(true);
  });

  it('exposes conformance rows and runtime events for plugin lifecycle operations', async () => {
    const userId = 'plugin-user-4';
    clearPluginEvents(userId);

    const conformance = listReferencePluginConformance();
    const pomodoro = conformance.find((row) => row.pluginId === 'pomodoro');
    expect(pomodoro?.ok).toBe(true);

    await installReferencePlugin({
      userId,
      pluginId: 'pomodoro',
      approvedPermissions: ['tools.execute'],
    });

    const state = getPluginPermissionState(userId, 'pomodoro');
    expect(state.granted).toContain('tools.execute');

    await reloadInstalledPlugin({ userId, pluginId: 'pomodoro' });
    await uninstallInstalledPlugin({ userId, pluginId: 'pomodoro' });

    const events = listPluginEvents({ userId, limit: 10 });
    expect(events.some((event) => event.type === 'plugin.installed')).toBe(true);
    expect(events.some((event) => event.type === 'plugin.reloaded')).toBe(true);
    expect(events.some((event) => event.type === 'plugin.uninstalled')).toBe(true);
  });
});
