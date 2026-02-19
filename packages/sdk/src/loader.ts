import { runInSandbox } from './sandbox';
import type {
  AshimPlugin,
  LoadedPlugin,
  PluginInstallOptions,
  PluginPermission,
  PluginRuntimeContext,
  PluginPanelDefinition,
  PluginToolDefinition,
} from './types';

const ALLOWED_PERMISSIONS = new Set<PluginPermission>([
  'activity.read',
  'activity.write',
  'notifications.write',
  'storage.read',
  'storage.write',
  'tools.execute',
]);

const validatePlugin = (plugin: AshimPlugin): void => {
  if (!plugin.manifest.id.trim()) {
    throw new Error('Plugin manifest.id is required.');
  }

  if (!plugin.manifest.name.trim()) {
    throw new Error(`Plugin ${plugin.manifest.id} is missing manifest.name.`);
  }

  for (const permission of plugin.manifest.permissions) {
    if (!ALLOWED_PERMISSIONS.has(permission)) {
      throw new Error(`Plugin ${plugin.manifest.id} declares unsupported permission: ${permission}`);
    }
  }
};

export class PluginLoader {
  private readonly registry = new Map<string, LoadedPlugin>();

  async install(
    plugin: AshimPlugin,
    context: PluginRuntimeContext,
    options: PluginInstallOptions = {}
  ): Promise<LoadedPlugin> {
    validatePlugin(plugin);

    if (this.registry.has(plugin.manifest.id)) {
      throw new Error(`Plugin ${plugin.manifest.id} is already installed.`);
    }

    const approved = new Set(options.approvedPermissions ?? plugin.manifest.permissions);
    const grantedPermissions = plugin.manifest.permissions.filter((permission) => approved.has(permission));
    const deniedPermissions = plugin.manifest.permissions.filter((permission) => !approved.has(permission));

    const loaded: LoadedPlugin = {
      plugin,
      activatedAtIso: new Date().toISOString(),
      grantedPermissions,
      deniedPermissions,
    };

    if (plugin.hooks?.onActivate) {
      await runInSandbox({
        operation: () => plugin.hooks?.onActivate?.(context),
      });
    }

    this.registry.set(plugin.manifest.id, loaded);
    return loaded;
  }

  async uninstall(pluginId: string, context: PluginRuntimeContext): Promise<void> {
    const loaded = this.registry.get(pluginId);
    if (!loaded) return;

    if (loaded.plugin.hooks?.onDeactivate) {
      await runInSandbox({
        operation: () => loaded.plugin.hooks?.onDeactivate?.(context),
      });
    }

    this.registry.delete(pluginId);
  }

  get(pluginId: string): LoadedPlugin | null {
    return this.registry.get(pluginId) ?? null;
  }

  list(): LoadedPlugin[] {
    return Array.from(this.registry.values());
  }

  listPanels(): Array<{ pluginId: string; panel: PluginPanelDefinition }> {
    return this.list().flatMap((loaded) =>
      (loaded.plugin.panelDefinitions ?? []).map((panel) => ({
        pluginId: loaded.plugin.manifest.id,
        panel,
      }))
    );
  }

  listTools(): Array<{ pluginId: string; tool: PluginToolDefinition }> {
    return this.list().flatMap((loaded) =>
      (loaded.plugin.toolDefinitions ?? []).map((tool) => ({
        pluginId: loaded.plugin.manifest.id,
        tool,
      }))
    );
  }
}
