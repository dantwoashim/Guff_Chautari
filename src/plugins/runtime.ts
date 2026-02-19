import {
  PluginLoader,
  PluginToolRuntime,
  renderPluginPanel,
  validatePluginConformance,
  type AshimPlugin,
  type LoadedPlugin,
  type PluginNotification,
  type PluginPanelContext,
  type PluginPermission,
  type PluginRuntimeContext,
} from '../../packages/sdk/src';
import { emitActivityEvent } from '../activity';
import { pomodoroPlugin } from './reference/pomodoro/plugin';

const NOTIFICATION_KEY_PREFIX = 'ashim.plugin.notifications.v1';
const PERMISSION_KEY_PREFIX = 'ashim.plugin.permissions.v1';
const EVENT_KEY_PREFIX = 'ashim.plugin.events.v1';
const MAX_EVENTS = 250;
const FALLBACK_AUTO_GRANT = true;

interface StoredPermissionGrant {
  granted: PluginPermission[];
  updatedAtIso: string;
}

export interface PluginPermissionState {
  requested: PluginPermission[];
  granted: PluginPermission[];
  denied: PluginPermission[];
}

export type PluginRuntimeEventType =
  | 'plugin.install_requested'
  | 'plugin.installed'
  | 'plugin.uninstalled'
  | 'plugin.reloaded'
  | 'plugin.permission_denied'
  | 'plugin.notification_emitted'
  | 'plugin.storage_read'
  | 'plugin.storage_write'
  | 'plugin.activity_emitted'
  | 'plugin.tool_invoked'
  | 'plugin.tool_blocked';

export interface PluginRuntimeEvent {
  id: string;
  userId: string;
  pluginId: string;
  type: PluginRuntimeEventType;
  message: string;
  createdAtIso: string;
  metadata?: Record<string, unknown>;
}

export interface ReferencePluginDescriptor {
  id: string;
  name: string;
  version: string;
  description: string;
  permissions: PluginPermission[];
  installed: boolean;
  grantedPermissions: PluginPermission[];
  deniedPermissions: PluginPermission[];
}

export interface ReferencePluginConformance {
  pluginId: string;
  ok: boolean;
  errors: string[];
}

const inMemoryStorage = new Map<string, string>();

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

const readRaw = (key: string): string | null => {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      // Fall back to in-memory store.
    }
  }
  return inMemoryStorage.get(key) ?? null;
};

const writeRaw = (key: string, value: string): void => {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(key, value);
      return;
    } catch {
      // Fall back to in-memory store.
    }
  }
  inMemoryStorage.set(key, value);
};

const readJson = <T>(key: string, fallback: T): T => {
  const raw = readRaw(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const writeJson = (key: string, value: unknown): void => {
  writeRaw(key, JSON.stringify(value));
};

const notificationKey = (userId: string): string => `${NOTIFICATION_KEY_PREFIX}.${userId}`;
const permissionKey = (userId: string, pluginId: string): string =>
  `${PERMISSION_KEY_PREFIX}.${userId}.${pluginId}`;
const eventKey = (userId: string): string => `${EVENT_KEY_PREFIX}.${userId}`;

const pluginStorageKey = (userId: string, pluginId: string, key: string): string => {
  return `ashim.plugin.storage.${userId}.${pluginId}.${key}`;
};

const readNotifications = (userId: string): PluginNotification[] => {
  return readJson<PluginNotification[]>(notificationKey(userId), []);
};

const writeNotifications = (userId: string, notifications: PluginNotification[]): void => {
  writeJson(notificationKey(userId), notifications.slice(-120));
};

const readPermissionGrant = (userId: string, pluginId: string): StoredPermissionGrant | null => {
  const parsed = readJson<StoredPermissionGrant | null>(permissionKey(userId, pluginId), null);
  if (!parsed) return null;
  if (!Array.isArray(parsed.granted)) return null;
  return {
    granted: parsed.granted.filter((item): item is PluginPermission => typeof item === 'string'),
    updatedAtIso:
      typeof parsed.updatedAtIso === 'string' ? parsed.updatedAtIso : new Date().toISOString(),
  };
};

const writePermissionGrant = (
  userId: string,
  pluginId: string,
  granted: ReadonlyArray<PluginPermission>
): void => {
  writeJson(permissionKey(userId, pluginId), {
    granted: [...granted],
    updatedAtIso: new Date().toISOString(),
  } satisfies StoredPermissionGrant);
};

const appendRuntimeEvent = (event: PluginRuntimeEvent): void => {
  const current = readJson<PluginRuntimeEvent[]>(eventKey(event.userId), []);
  writeJson(eventKey(event.userId), [...current, event].slice(-MAX_EVENTS));
};

const logRuntimeEvent = (payload: {
  userId: string;
  pluginId: string;
  type: PluginRuntimeEventType;
  message: string;
  metadata?: Record<string, unknown>;
}): void => {
  appendRuntimeEvent({
    id: makeId('plugin-event'),
    userId: payload.userId,
    pluginId: payload.pluginId,
    type: payload.type,
    message: payload.message,
    createdAtIso: new Date().toISOString(),
    metadata: payload.metadata,
  });
};

const loader = new PluginLoader();

const discoverLocalPlugins = (): AshimPlugin[] => {
  const discovered = Object.values(import.meta.glob('./reference/**/plugin.tsx', { eager: true }))
    .map((module) => {
      const record = module as Record<string, unknown>;
      const candidate = Object.values(record).find(
        (value) =>
          Boolean(value) &&
          typeof value === 'object' &&
          'manifest' in (value as Record<string, unknown>)
      );
      return candidate as AshimPlugin | undefined;
    })
    .filter((plugin): plugin is AshimPlugin => Boolean(plugin));

  if (discovered.length > 0) return discovered;
  return [pomodoroPlugin];
};

const REFERENCE_PLUGINS: AshimPlugin[] = discoverLocalPlugins();
const referencePluginMap = new Map(REFERENCE_PLUGINS.map((plugin) => [plugin.manifest.id, plugin]));

const resolveReferencePlugin = (pluginId: string): AshimPlugin => {
  const plugin = referencePluginMap.get(pluginId);
  if (!plugin) {
    throw new Error(`Reference plugin "${pluginId}" is not available.`);
  }
  return plugin;
};

const getGrantedPermissions = (pluginId: string): Set<PluginPermission> => {
  const loaded = loader.get(pluginId);
  if (!loaded) return new Set<PluginPermission>();
  return new Set(loaded.grantedPermissions);
};

const requirePermission = (
  userId: string,
  pluginId: string,
  permission: PluginPermission,
  deniedMessage: string
): boolean => {
  const granted = getGrantedPermissions(pluginId);
  if (granted.has(permission)) return true;

  logRuntimeEvent({
    userId,
    pluginId,
    type: 'plugin.permission_denied',
    message: deniedMessage,
    metadata: {
      permission,
    },
  });
  return false;
};

const createPluginContext = (pluginId: string, userId: string): PluginRuntimeContext => ({
  userId,
  pluginId,
  notify(payload) {
    if (!requirePermission(userId, pluginId, 'notifications.write', 'Notification blocked by permission policy.')) {
      return;
    }

    const notification: PluginNotification = {
      id: makeId('plugin-notification'),
      pluginId,
      level: payload.level,
      message: payload.message,
      createdAtIso: new Date().toISOString(),
    };

    const current = readNotifications(userId);
    writeNotifications(userId, [...current, notification]);

    logRuntimeEvent({
      userId,
      pluginId,
      type: 'plugin.notification_emitted',
      message: payload.message,
    });

    emitActivityEvent({
      userId,
      category: 'plugin',
      eventType: 'plugin.notification',
      title: `${pluginId} notification`,
      description: payload.message,
    });
  },
  readStorage<T = unknown>(key: string): T | null {
    if (!requirePermission(userId, pluginId, 'storage.read', `Storage read denied for key "${key}".`)) {
      return null;
    }

    logRuntimeEvent({
      userId,
      pluginId,
      type: 'plugin.storage_read',
      message: `Read storage key "${key}".`,
    });

    try {
      const raw = readRaw(pluginStorageKey(userId, pluginId, key));
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },
  writeStorage(key: string, value: unknown) {
    if (!requirePermission(userId, pluginId, 'storage.write', `Storage write denied for key "${key}".`)) {
      return;
    }

    writeRaw(pluginStorageKey(userId, pluginId, key), JSON.stringify(value));
    logRuntimeEvent({
      userId,
      pluginId,
      type: 'plugin.storage_write',
      message: `Wrote storage key "${key}".`,
    });
  },
  emitActivity(payload) {
    if (!requirePermission(userId, pluginId, 'activity.write', 'Activity emit denied by permission policy.')) {
      return;
    }

    logRuntimeEvent({
      userId,
      pluginId,
      type: 'plugin.activity_emitted',
      message: payload.title,
      metadata: {
        eventType: payload.eventType,
      },
    });

    emitActivityEvent({
      userId,
      category: 'plugin',
      eventType: payload.eventType,
      title: payload.title,
      description: payload.description,
    });
  },
});

const toolRuntime = new PluginToolRuntime(loader, createPluginContext);

const resolveApprovedPermissions = (payload: {
  userId: string;
  plugin: AshimPlugin;
  approvedPermissions?: ReadonlyArray<PluginPermission>;
}): PluginPermission[] => {
  if (payload.approvedPermissions) {
    return payload.plugin.manifest.permissions.filter((permission) =>
      payload.approvedPermissions?.includes(permission)
    );
  }

  const persisted = readPermissionGrant(payload.userId, payload.plugin.manifest.id);
  if (persisted) {
    return payload.plugin.manifest.permissions.filter((permission) =>
      persisted.granted.includes(permission)
    );
  }

  return FALLBACK_AUTO_GRANT ? [...payload.plugin.manifest.permissions] : [];
};

const installReferencePluginInternal = async (payload: {
  userId: string;
  plugin: AshimPlugin;
  approvedPermissions?: ReadonlyArray<PluginPermission>;
}): Promise<LoadedPlugin> => {
  const conformance = validatePluginConformance(payload.plugin);
  if (!conformance.ok) {
    throw new Error(
      `Plugin ${payload.plugin.manifest.id} failed conformance: ${conformance.errors.join(', ')}`
    );
  }

  const approvedPermissions = resolveApprovedPermissions(payload);
  writePermissionGrant(payload.userId, payload.plugin.manifest.id, approvedPermissions);

  logRuntimeEvent({
    userId: payload.userId,
    pluginId: payload.plugin.manifest.id,
    type: 'plugin.install_requested',
    message: `Install requested for ${payload.plugin.manifest.name}.`,
    metadata: {
      approvedPermissions,
    },
  });

  const existing = loader.get(payload.plugin.manifest.id);
  if (existing) {
    await loader.uninstall(payload.plugin.manifest.id, createPluginContext(payload.plugin.manifest.id, payload.userId));
  }

  const loaded = await loader.install(
    payload.plugin,
    createPluginContext(payload.plugin.manifest.id, payload.userId),
    {
      approvedPermissions,
    }
  );

  logRuntimeEvent({
    userId: payload.userId,
    pluginId: payload.plugin.manifest.id,
    type: 'plugin.installed',
    message: `${payload.plugin.manifest.name} installed.`,
    metadata: {
      grantedPermissions: loaded.grantedPermissions,
      deniedPermissions: loaded.deniedPermissions,
    },
  });

  emitActivityEvent({
    userId: payload.userId,
    category: 'plugin',
    eventType: 'plugin.installed',
    title: `${payload.plugin.manifest.name} installed`,
    description: payload.plugin.manifest.description,
  });

  return loaded;
};

export const listReferencePlugins = (): ReferencePluginDescriptor[] => {
  return REFERENCE_PLUGINS.map((plugin) => {
    const loaded = loader.get(plugin.manifest.id);
    return {
      id: plugin.manifest.id,
      name: plugin.manifest.name,
      version: plugin.manifest.version,
      description: plugin.manifest.description,
      permissions: plugin.manifest.permissions,
      installed: Boolean(loaded),
      grantedPermissions: loaded?.grantedPermissions ?? [],
      deniedPermissions: loaded?.deniedPermissions ?? [],
    };
  });
};

export const listReferencePluginConformance = (): ReferencePluginConformance[] => {
  return REFERENCE_PLUGINS.map((plugin) => {
    const result = validatePluginConformance(plugin);
    return {
      pluginId: plugin.manifest.id,
      ok: result.ok,
      errors: result.errors,
    };
  });
};

export const getPluginPermissionState = (
  userId: string,
  pluginId: string
): PluginPermissionState => {
  const plugin = resolveReferencePlugin(pluginId);
  const loaded = loader.get(pluginId);
  if (loaded) {
    return {
      requested: [...plugin.manifest.permissions],
      granted: [...loaded.grantedPermissions],
      denied: [...loaded.deniedPermissions],
    };
  }

  const persisted = readPermissionGrant(userId, pluginId);
  if (!persisted) {
    return {
      requested: [...plugin.manifest.permissions],
      granted: [],
      denied: [],
    };
  }

  const granted = plugin.manifest.permissions.filter((permission) =>
    persisted.granted.includes(permission)
  );
  const denied = plugin.manifest.permissions.filter((permission) => !granted.includes(permission));

  return {
    requested: [...plugin.manifest.permissions],
    granted,
    denied,
  };
};

export const installReferencePlugin = async (payload: {
  userId: string;
  pluginId: string;
  approvedPermissions?: ReadonlyArray<PluginPermission>;
}): Promise<LoadedPlugin> => {
  const plugin = resolveReferencePlugin(payload.pluginId);
  return await installReferencePluginInternal({
    userId: payload.userId,
    plugin,
    approvedPermissions: payload.approvedPermissions,
  });
};

export const updatePluginPermissions = async (payload: {
  userId: string;
  pluginId: string;
  approvedPermissions: ReadonlyArray<PluginPermission>;
}): Promise<LoadedPlugin | null> => {
  writePermissionGrant(payload.userId, payload.pluginId, payload.approvedPermissions);
  if (!loader.get(payload.pluginId)) return null;

  return await reloadInstalledPlugin({
    userId: payload.userId,
    pluginId: payload.pluginId,
  });
};

export const ensureReferencePluginsInstalled = async (
  userId: string,
  options?: {
    autoGrantMissing?: boolean;
  }
): Promise<void> => {
  const autoGrantMissing = options?.autoGrantMissing ?? FALLBACK_AUTO_GRANT;

  for (const plugin of REFERENCE_PLUGINS) {
    if (loader.get(plugin.manifest.id)) continue;

    const persisted = readPermissionGrant(userId, plugin.manifest.id);
    if (!persisted && !autoGrantMissing) {
      continue;
    }

    await installReferencePluginInternal({
      userId,
      plugin,
      approvedPermissions: persisted?.granted,
    });
  }
};

export const uninstallInstalledPlugin = async (payload: {
  userId: string;
  pluginId: string;
}): Promise<void> => {
  const loaded = loader.get(payload.pluginId);
  if (!loaded) return;

  await loader.uninstall(payload.pluginId, createPluginContext(payload.pluginId, payload.userId));

  logRuntimeEvent({
    userId: payload.userId,
    pluginId: payload.pluginId,
    type: 'plugin.uninstalled',
    message: `${loaded.plugin.manifest.name} uninstalled.`,
  });

  emitActivityEvent({
    userId: payload.userId,
    category: 'plugin',
    eventType: 'plugin.uninstalled',
    title: `${loaded.plugin.manifest.name} uninstalled`,
    description: 'Plugin removed from local runtime.',
  });
};

export const reloadInstalledPlugin = async (payload: {
  userId: string;
  pluginId: string;
}): Promise<LoadedPlugin> => {
  const plugin = resolveReferencePlugin(payload.pluginId);
  const current = getPluginPermissionState(payload.userId, payload.pluginId);
  const persisted = readPermissionGrant(payload.userId, payload.pluginId);
  const approvedPermissions = persisted?.granted ?? current.granted;

  await loader.uninstall(payload.pluginId, createPluginContext(payload.pluginId, payload.userId));
  const reloaded = await installReferencePluginInternal({
    userId: payload.userId,
    plugin,
    approvedPermissions,
  });

  logRuntimeEvent({
    userId: payload.userId,
    pluginId: payload.pluginId,
    type: 'plugin.reloaded',
    message: `${plugin.manifest.name} reloaded.`,
  });

  return reloaded;
};

export const listInstalledPlugins = () => loader.list();

export const listPluginNotifications = (userId: string, pluginId?: string): PluginNotification[] => {
  const rows = readNotifications(userId).sort(
    (left, right) => Date.parse(right.createdAtIso) - Date.parse(left.createdAtIso)
  );

  if (!pluginId) return rows;
  return rows.filter((row) => row.pluginId === pluginId);
};

export const listPluginEvents = (payload: {
  userId: string;
  pluginId?: string;
  limit?: number;
}): PluginRuntimeEvent[] => {
  const events = readJson<PluginRuntimeEvent[]>(eventKey(payload.userId), []).sort(
    (left, right) => Date.parse(right.createdAtIso) - Date.parse(left.createdAtIso)
  );

  const filtered = payload.pluginId
    ? events.filter((event) => event.pluginId === payload.pluginId)
    : events;

  if (typeof payload.limit === 'number') {
    return filtered.slice(0, Math.max(1, payload.limit));
  }
  return filtered;
};

export const clearPluginEvents = (userId: string): void => {
  writeJson(eventKey(userId), []);
};

export const renderInstalledPluginPanel = (payload: {
  userId: string;
  pluginId: string;
  panelId: string;
}) => {
  const context: PluginPanelContext = {
    ...createPluginContext(payload.pluginId, payload.userId),
    notifications: listPluginNotifications(payload.userId, payload.pluginId),
  };

  return renderPluginPanel({
    loader,
    pluginId: payload.pluginId,
    panelId: payload.panelId,
    context,
  });
};

export const listPluginPanels = (payload?: { pluginId?: string }) => {
  const all = loader.listPanels();
  if (!payload?.pluginId) return all;
  return all.filter((entry) => entry.pluginId === payload.pluginId);
};

export const listPluginTools = () => {
  return loader
    .listTools()
    .filter((entry) => loader.get(entry.pluginId)?.grantedPermissions.includes('tools.execute'));
};

export const invokePluginTool = async (payload: {
  userId: string;
  pluginId: string;
  toolId: string;
  toolPayload?: Record<string, unknown>;
}) => {
  const outcome = await toolRuntime.invoke({
    userId: payload.userId,
    pluginId: payload.pluginId,
    toolId: payload.toolId,
    payload: payload.toolPayload,
  });

  logRuntimeEvent({
    userId: payload.userId,
    pluginId: payload.pluginId,
    type: outcome.decision.decision === 'allow' ? 'plugin.tool_invoked' : 'plugin.tool_blocked',
    message:
      outcome.decision.decision === 'allow'
        ? `Tool "${payload.toolId}" executed.`
        : `Tool "${payload.toolId}" blocked: ${outcome.decision.reason}`,
    metadata: {
      toolId: payload.toolId,
      decision: outcome.decision.decision,
      reason: outcome.decision.reason,
    },
  });

  return outcome;
};
