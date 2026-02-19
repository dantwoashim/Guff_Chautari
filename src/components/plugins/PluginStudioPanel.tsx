import React, { useEffect, useMemo, useState } from 'react';
import type { PluginPermission } from '../../../packages/sdk/src';
import {
  clearPluginEvents,
  ensureReferencePluginsInstalled,
  getPluginPermissionState,
  installReferencePlugin,
  invokePluginTool,
  listInstalledPlugins,
  listPluginEvents,
  listPluginNotifications,
  listPluginPanels,
  listPluginTools,
  listReferencePluginConformance,
  listReferencePlugins,
  reloadInstalledPlugin,
  renderInstalledPluginPanel,
  uninstallInstalledPlugin,
  updatePluginPermissions,
} from '../../plugins';

interface PluginStudioPanelProps {
  userId: string;
}

const panelClass = 'rounded-xl border border-[#313d45] bg-[#111b21] p-4 text-sm text-[#c7d0d6]';

const PLUGIN_PERMISSIONS: PluginPermission[] = [
  'activity.read',
  'activity.write',
  'notifications.write',
  'storage.read',
  'storage.write',
  'tools.execute',
];

export const PluginStudioPanel: React.FC<PluginStudioPanelProps> = ({ userId }) => {
  const [status, setStatus] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);
  const [selectedPluginId, setSelectedPluginId] = useState<string | null>(null);
  const [selectedPanelId, setSelectedPanelId] = useState<string | null>(null);
  const [selectedToolId, setSelectedToolId] = useState<string>('');
  const [toolPayloadText, setToolPayloadText] = useState('{}');
  const [toolResult, setToolResult] = useState('');
  const [checkedPermissions, setCheckedPermissions] = useState<Record<PluginPermission, boolean>>({
    'activity.read': false,
    'activity.write': false,
    'notifications.write': false,
    'storage.read': false,
    'storage.write': false,
    'tools.execute': false,
  });

  const refresh = () => setRefreshTick((tick) => tick + 1);

  useEffect(() => {
    void (async () => {
      try {
        await ensureReferencePluginsInstalled(userId, { autoGrantMissing: false });
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Failed to restore installed plugins.');
      } finally {
        refresh();
      }
    })();
  }, [userId]);

  const referencePlugins = useMemo(() => {
    void refreshTick;
    return listReferencePlugins();
  }, [refreshTick]);

  const installedPlugins = useMemo(() => {
    void refreshTick;
    return listInstalledPlugins();
  }, [refreshTick]);

  const conformanceRows = useMemo(() => {
    void refreshTick;
    return listReferencePluginConformance();
  }, [refreshTick]);

  const selectedReferencePlugin = useMemo(() => {
    if (referencePlugins.length === 0) return null;
    if (!selectedPluginId) return referencePlugins[0];
    return referencePlugins.find((plugin) => plugin.id === selectedPluginId) ?? referencePlugins[0];
  }, [referencePlugins, selectedPluginId]);

  useEffect(() => {
    if (!selectedReferencePlugin) return;
    const state = getPluginPermissionState(userId, selectedReferencePlugin.id);
    const next: Record<PluginPermission, boolean> = {
      'activity.read': false,
      'activity.write': false,
      'notifications.write': false,
      'storage.read': false,
      'storage.write': false,
      'tools.execute': false,
    };
    for (const permission of state.granted) {
      next[permission] = true;
    }
    setCheckedPermissions(next);
  }, [selectedReferencePlugin, userId, refreshTick]);

  const selectedPluginLoaded = useMemo(() => {
    if (!selectedReferencePlugin) return null;
    return installedPlugins.find((plugin) => plugin.plugin.manifest.id === selectedReferencePlugin.id) ?? null;
  }, [installedPlugins, selectedReferencePlugin]);

  const selectedPermissionState = useMemo(() => {
    void refreshTick;
    if (!selectedReferencePlugin) return null;
    return getPluginPermissionState(userId, selectedReferencePlugin.id);
  }, [selectedReferencePlugin, userId, refreshTick]);

  const panels = useMemo(() => {
    void refreshTick;
    if (!selectedReferencePlugin) return [];
    return listPluginPanels({ pluginId: selectedReferencePlugin.id });
  }, [refreshTick, selectedReferencePlugin]);

  const selectedPanel = useMemo(() => {
    if (panels.length === 0) return null;
    if (!selectedPanelId) return panels[0];
    return panels.find((panel) => panel.panel.id === selectedPanelId) ?? panels[0];
  }, [panels, selectedPanelId]);

  const tools = useMemo(() => {
    void refreshTick;
    if (!selectedReferencePlugin) return [];
    return listPluginTools().filter((tool) => tool.pluginId === selectedReferencePlugin.id);
  }, [refreshTick, selectedReferencePlugin]);

  const notifications = useMemo(() => {
    void refreshTick;
    if (!selectedReferencePlugin) return [];
    return listPluginNotifications(userId, selectedReferencePlugin.id).slice(0, 8);
  }, [refreshTick, selectedReferencePlugin, userId]);

  const events = useMemo(() => {
    void refreshTick;
    return listPluginEvents({
      userId,
      pluginId: selectedReferencePlugin?.id,
      limit: 20,
    });
  }, [refreshTick, selectedReferencePlugin?.id, userId]);

  const renderedPanel = useMemo(() => {
    if (!selectedReferencePlugin || !selectedPanel || !selectedPluginLoaded) return null;
    return renderInstalledPluginPanel({
      userId,
      pluginId: selectedReferencePlugin.id,
      panelId: selectedPanel.panel.id,
    });
  }, [selectedPanel, selectedReferencePlugin, selectedPluginLoaded, userId]);

  const applyInstallOrPermissionUpdate = async () => {
    if (!selectedReferencePlugin) return;
    const approvedPermissions = PLUGIN_PERMISSIONS.filter((permission) => checkedPermissions[permission]);

    if (selectedPluginLoaded) {
      await updatePluginPermissions({
        userId,
        pluginId: selectedReferencePlugin.id,
        approvedPermissions,
      });
      setStatus(`Permissions updated for ${selectedReferencePlugin.name}.`);
      refresh();
      return;
    }

    await installReferencePlugin({
      userId,
      pluginId: selectedReferencePlugin.id,
      approvedPermissions,
    });
    setStatus(`${selectedReferencePlugin.name} installed.`);
    refresh();
  };

  const runTool = async () => {
    if (!selectedReferencePlugin) return;
    if (!selectedToolId.trim()) {
      setToolResult('Select a tool first.');
      return;
    }

    let parsedPayload: Record<string, unknown> = {};
    try {
      parsedPayload = JSON.parse(toolPayloadText) as Record<string, unknown>;
    } catch {
      setToolResult('Payload must be valid JSON.');
      return;
    }

    const outcome = await invokePluginTool({
      userId,
      pluginId: selectedReferencePlugin.id,
      toolId: selectedToolId,
      toolPayload: parsedPayload,
    });

    if (outcome.decision.decision !== 'allow') {
      setToolResult(`Policy decision: ${outcome.decision.decision} (${outcome.decision.reason}).`);
      refresh();
      return;
    }

    setToolResult(outcome.result?.summary ?? 'No tool summary returned.');
    refresh();
  };

  return (
    <div className="h-full overflow-y-auto bg-[#0b141a] p-4">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#e9edef]">Plugin Studio</h2>
            <p className="text-sm text-[#8696a0]">
              Install local plugins, approve permissions, inspect runtime events, and test tools.
            </p>
          </div>
          <div className="text-xs text-[#8696a0]">{installedPlugins.length} plugin(s) installed</div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <section className={panelClass}>
            <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Reference Plugins</h3>
            <div className="space-y-2">
              {referencePlugins.map((plugin) => {
                const selected = selectedReferencePlugin?.id === plugin.id;
                return (
                  <button
                    key={plugin.id}
                    type="button"
                    className={`w-full rounded border px-3 py-2 text-left text-xs ${
                      selected
                        ? 'border-[#00a884] bg-[#173b38] text-[#dffaf3]'
                        : 'border-[#313d45] bg-[#0f171c] text-[#9fb0ba] hover:border-[#4a5961]'
                    }`}
                    onClick={() => {
                      setSelectedPluginId(plugin.id);
                      setSelectedPanelId(null);
                      setSelectedToolId('');
                    }}
                  >
                    <div className="text-sm text-[#e9edef]">{plugin.name}</div>
                    <div className="mt-1 text-[11px] text-[#7f929c]">
                      {plugin.description} • v{plugin.version}
                    </div>
                    <div className="mt-1 text-[11px]">
                      {plugin.installed ? (
                        <span className="text-[#80d6c6]">Installed</span>
                      ) : (
                        <span className="text-[#d3ac75]">Not installed</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className={`${panelClass} lg:col-span-2`}>
            <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Permissions & Lifecycle</h3>
            {selectedReferencePlugin ? (
              <>
                <div className="grid gap-2 md:grid-cols-2">
                  {PLUGIN_PERMISSIONS.map((permission) => (
                    <label
                      key={permission}
                      className="flex items-center justify-between rounded border border-[#2d3942] bg-[#0f171c] px-2 py-1.5 text-xs"
                    >
                      <span>{permission}</span>
                      <input
                        type="checkbox"
                        checked={checkedPermissions[permission]}
                        onChange={(event) =>
                          setCheckedPermissions((current) => ({
                            ...current,
                            [permission]: event.target.checked,
                          }))
                        }
                      />
                    </label>
                  ))}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded border border-[#00a884] px-3 py-1.5 text-xs text-[#aef5e9] hover:bg-[#12453f]"
                    onClick={() => {
                      void applyInstallOrPermissionUpdate();
                    }}
                  >
                    {selectedPluginLoaded ? 'Update Permissions' : 'Install Plugin'}
                  </button>
                  {selectedPluginLoaded ? (
                    <>
                      <button
                        type="button"
                        className="rounded border border-[#4f6f84] px-3 py-1.5 text-xs text-[#bfd8e8] hover:bg-[#1d3140]"
                        onClick={() => {
                          void reloadInstalledPlugin({
                            userId,
                            pluginId: selectedReferencePlugin.id,
                          }).then(() => {
                            setStatus(`${selectedReferencePlugin.name} reloaded.`);
                            refresh();
                          });
                        }}
                      >
                        Hot Reload
                      </button>
                      <button
                        type="button"
                        className="rounded border border-[#7b3b3b] px-3 py-1.5 text-xs text-[#f0bbbb] hover:bg-[#3e1c1c]"
                        onClick={() => {
                          void uninstallInstalledPlugin({
                            userId,
                            pluginId: selectedReferencePlugin.id,
                          }).then(() => {
                            setStatus(`${selectedReferencePlugin.name} uninstalled.`);
                            refresh();
                          });
                        }}
                      >
                        Uninstall
                      </button>
                    </>
                  ) : null}
                </div>

                {selectedPermissionState ? (
                  <div className="mt-3 rounded border border-[#27343d] bg-[#0f171c] p-2 text-xs text-[#9fb0ba]">
                    Granted: {selectedPermissionState.granted.join(', ') || 'none'} | Denied:{' '}
                    {selectedPermissionState.denied.join(', ') || 'none'}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="rounded border border-[#2d3942] bg-[#0f171c] p-3 text-xs text-[#8ea1ab]">
                No reference plugins found.
              </div>
            )}
          </section>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className={panelClass}>
            <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Plugin Panel Renderer</h3>
            {selectedPluginLoaded && selectedReferencePlugin ? (
              <>
                <div className="mb-2 flex flex-wrap gap-2">
                  {panels.map((entry) => (
                    <button
                      key={entry.panel.id}
                      type="button"
                      className={`rounded border px-2 py-1 text-xs ${
                        selectedPanel?.panel.id === entry.panel.id
                          ? 'border-[#00a884] bg-[#173b38] text-[#dffaf3]'
                          : 'border-[#313d45] bg-[#0f171c] text-[#9fb0ba] hover:border-[#4a5961]'
                      }`}
                      onClick={() => setSelectedPanelId(entry.panel.id)}
                    >
                      {entry.panel.title}
                    </button>
                  ))}
                </div>
                <div className="rounded border border-[#27343d] bg-[#0f171c] p-3">{renderedPanel}</div>
              </>
            ) : (
              <div className="rounded border border-[#2d3942] bg-[#0f171c] p-3 text-xs text-[#8ea1ab]">
                Install the plugin to render its panels.
              </div>
            )}
          </section>

          <section className={panelClass}>
            <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Plugin Tool Invocation</h3>
            <select
              value={selectedToolId}
              onChange={(event) => setSelectedToolId(event.target.value)}
              className="mb-2 w-full rounded border border-[#313d45] bg-[#0f171c] px-3 py-2 text-xs text-[#dfe7eb]"
            >
              <option value="">Select tool...</option>
              {tools.map((entry) => (
                <option key={entry.tool.id} value={entry.tool.id}>
                  {entry.tool.id} ({entry.tool.mutation ? 'mutation' : 'read'})
                </option>
              ))}
            </select>
            <textarea
              value={toolPayloadText}
              onChange={(event) => setToolPayloadText(event.target.value)}
              className="h-20 w-full rounded border border-[#313d45] bg-[#0f171c] px-3 py-2 text-xs text-[#dfe7eb]"
            />
            <button
              type="button"
              className="mt-2 rounded border border-[#4f6f84] px-3 py-1.5 text-xs text-[#bfd8e8] hover:bg-[#1d3140]"
              onClick={() => {
                void runTool();
              }}
            >
              Run Tool
            </button>
            {toolResult ? (
              <div className="mt-2 rounded border border-[#27343d] bg-[#0f171c] p-2 text-xs text-[#9fb0ba]">
                {toolResult}
              </div>
            ) : null}
          </section>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className={panelClass}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#e9edef]">Runtime Event Inspector</h3>
              <button
                type="button"
                className="rounded border border-[#313d45] px-2 py-1 text-[11px] text-[#9fb0ba] hover:bg-[#0f171c]"
                onClick={() => {
                  clearPluginEvents(userId);
                  refresh();
                }}
              >
                Clear
              </button>
            </div>
            <div className="space-y-2">
              {events.length === 0 ? (
                <div className="rounded border border-[#2d3942] bg-[#0f171c] p-3 text-xs text-[#8ea1ab]">
                  No plugin events yet.
                </div>
              ) : (
                events.map((event) => (
                  <div key={event.id} className="rounded border border-[#27343d] bg-[#0f171c] p-2 text-xs">
                    <div className="text-[#dfe7eb]">{event.message}</div>
                    <div className="text-[11px] text-[#7f929c]">
                      {event.type} • {new Date(event.createdAtIso).toLocaleString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className={panelClass}>
            <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Conformance & Notifications</h3>
            <div className="space-y-2">
              {selectedReferencePlugin ? (
                conformanceRows
                  .filter((row) => row.pluginId === selectedReferencePlugin.id)
                  .map((row) => (
                    <div key={row.pluginId} className="rounded border border-[#27343d] bg-[#0f171c] p-2 text-xs">
                      <div className={row.ok ? 'text-[#8dd6c8]' : 'text-[#f2a7a7]'}>
                        Conformance: {row.ok ? 'PASS' : 'FAIL'}
                      </div>
                      {!row.ok ? (
                        <div className="mt-1 text-[#f5c5c5]">{row.errors.join('; ')}</div>
                      ) : null}
                    </div>
                  ))
              ) : null}

              {notifications.length === 0 ? (
                <div className="rounded border border-[#2d3942] bg-[#0f171c] p-3 text-xs text-[#8ea1ab]">
                  No plugin notifications yet.
                </div>
              ) : (
                notifications.map((notification) => (
                  <div key={notification.id} className="rounded border border-[#27343d] bg-[#0f171c] p-2 text-xs">
                    <div className="text-[#e9edef]">{notification.message}</div>
                    <div className="text-[11px] text-[#7f929c]">
                      {new Date(notification.createdAtIso).toLocaleString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {status ? (
          <div className="rounded border border-[#31596b] bg-[#102531] px-3 py-2 text-xs text-[#b8dbeb]">{status}</div>
        ) : null}
      </div>
    </div>
  );
};

export default PluginStudioPanel;
