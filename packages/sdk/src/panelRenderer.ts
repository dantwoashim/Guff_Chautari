import React, { type ReactNode } from 'react';
import type { PluginLoader } from './loader';
import type { PluginPanelContext } from './types';

export const renderPluginPanel = (payload: {
  loader: PluginLoader;
  pluginId: string;
  panelId: string;
  context: PluginPanelContext;
}): ReactNode | null => {
  const loaded = payload.loader.get(payload.pluginId);
  if (!loaded) return null;

  const panel = loaded.plugin.panelDefinitions?.find((candidate) => candidate.id === payload.panelId);
  if (!panel) return null;

  try {
    return panel.renderMode === 'iframe' && panel.iframeSrcDoc
      ? React.createElement('iframe', {
          title: `${payload.pluginId}:${panel.id}`,
          srcDoc: panel.iframeSrcDoc,
          sandbox: 'allow-scripts',
          className: 'w-full rounded border border-[#27343d] bg-[#0f171c]',
          style: {
            minHeight: panel.iframeHeightPx ?? 280,
            border: 0,
          },
        })
      : panel.render(payload.context);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown panel error';
    console.error(`Plugin panel crashed (${payload.pluginId}/${panel.id}): ${detail}`);
    return React.createElement(
      'div',
      {
        className: 'rounded border border-rose-900 bg-rose-950/40 p-3 text-xs text-rose-300',
      },
      `Plugin panel "${panel.id}" crashed.`
    );
  }
};
