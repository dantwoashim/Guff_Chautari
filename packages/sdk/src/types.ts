import type { ReactNode } from 'react';

export type PluginPermission =
  | 'activity.read'
  | 'activity.write'
  | 'notifications.write'
  | 'storage.read'
  | 'storage.write'
  | 'tools.execute';

export interface AshimPluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  permissions: PluginPermission[];
}

export interface PluginNotification {
  id: string;
  pluginId: string;
  level: 'info' | 'warning' | 'error';
  message: string;
  createdAtIso: string;
}

export interface PluginRuntimeContext {
  userId: string;
  pluginId: string;
  notify: (payload: { level: PluginNotification['level']; message: string }) => void;
  readStorage: <T = unknown>(key: string) => T | null;
  writeStorage: (key: string, value: unknown) => void;
  emitActivity: (payload: { eventType: string; title: string; description: string }) => void;
}

export interface PluginPanelContext extends PluginRuntimeContext {
  notifications: PluginNotification[];
}

export type PluginPanelRenderMode = 'host' | 'iframe';

export interface PluginPanelDefinition {
  id: string;
  title: string;
  slot: 'primary' | 'secondary';
  renderMode?: PluginPanelRenderMode;
  iframeSrcDoc?: string;
  iframeHeightPx?: number;
  render: (context: PluginPanelContext) => ReactNode;
}

export interface PluginToolResult {
  ok: boolean;
  summary: string;
  data?: Record<string, unknown>;
  errorMessage?: string;
}

export interface PluginToolDefinition {
  id: string;
  title: string;
  description: string;
  mutation: boolean;
  idempotent?: boolean;
  execute: (
    payload: Record<string, unknown>,
    context: PluginRuntimeContext
  ) => Promise<PluginToolResult>;
}

export interface PluginHooks {
  onActivate?: (context: PluginRuntimeContext) => Promise<void> | void;
  onDeactivate?: (context: PluginRuntimeContext) => Promise<void> | void;
}

export interface AshimPlugin {
  manifest: AshimPluginManifest;
  panelDefinitions?: PluginPanelDefinition[];
  toolDefinitions?: PluginToolDefinition[];
  hooks?: PluginHooks;
}

export interface LoadedPlugin {
  plugin: AshimPlugin;
  activatedAtIso: string;
  grantedPermissions: PluginPermission[];
  deniedPermissions: PluginPermission[];
}

export interface PluginInstallOptions {
  approvedPermissions?: ReadonlyArray<PluginPermission>;
}
