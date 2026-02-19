import type {
  VerticalActivation,
  VerticalActivationInput,
  VerticalConfig,
  VerticalActivationHistoryEntry,
  VerticalModule,
} from './types';
import { normalizeVerticalConfig, validateVerticalConfig } from './validation';

const slug = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const unique = <T>(items: ReadonlyArray<T>): T[] => [...new Set(items)];

const STORAGE_KEY = 'ashim.verticals.runtime.v1';
const ACTIVATION_HISTORY_LIMIT = 120;

interface PersistedVerticalRuntimeState {
  activations: VerticalActivation[];
  history: VerticalActivationHistoryEntry[];
  customConfigs: VerticalConfig[];
  workspaceSearchNamespaces: Array<{
    workspaceId: string;
    namespaces: string[];
  }>;
}

const canUseStorage = (): boolean => {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
};

const readPersistedState = (): PersistedVerticalRuntimeState | null => {
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedVerticalRuntimeState>;
    if (!parsed || !Array.isArray(parsed.activations) || !Array.isArray(parsed.history)) {
      return null;
    }
    return {
      activations: parsed.activations,
      history: parsed.history,
      customConfigs: Array.isArray(parsed.customConfigs) ? parsed.customConfigs : [],
      workspaceSearchNamespaces: Array.isArray(parsed.workspaceSearchNamespaces)
        ? parsed.workspaceSearchNamespaces
        : [],
    };
  } catch {
    return null;
  }
};

const writePersistedState = (state: PersistedVerticalRuntimeState): void => {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Keep runtime non-blocking if storage quota is reached.
  }
};

const modulesFromConfig = (config: VerticalConfig): VerticalModule[] => {
  const modules: VerticalModule[] = [
    {
      type: 'persona',
      id: config.persona.id,
      title: config.persona.name,
      description: config.persona.description,
    },
  ];

  for (const workflow of config.workflows) {
    modules.push({
      type: 'workflow',
      id: workflow.id,
      title: workflow.title,
      description: workflow.description,
    });
  }

  for (const template of config.knowledgeTemplates) {
    modules.push({
      type: 'knowledge_template',
      id: template.id,
      title: template.title,
      description: template.description,
    });
  }

  for (const preset of config.decisionPresets) {
    modules.push({
      type: 'decision_preset',
      id: preset.id,
      title: preset.title,
      description: preset.description,
    });
  }

  for (const panelId of config.uiPanels) {
    modules.push({
      type: 'ui_panel',
      id: panelId,
      title: panelId,
      description: `${config.name} UI panel`,
    });
  }

  for (const boundary of config.safetyBoundaries) {
    modules.push({
      type: 'safety_boundary',
      id: boundary.id,
      title: boundary.rule,
      description: boundary.onViolation,
    });
  }

  return modules;
};

const knowledgeNamespacesFromConfig = (config: VerticalConfig): string[] => {
  return unique(
    config.knowledgeTemplates.map(
      (template) => `vertical.${config.id}.knowledge.${slug(template.id || template.title)}`
    )
  ).sort((left, right) => left.localeCompare(right));
};

export class VerticalRuntime {
  private readonly configsById = new Map<string, VerticalConfig>();
  private readonly activeByWorkspace = new Map<string, VerticalActivation>();
  private readonly activationHistoryByWorkspace = new Map<string, VerticalActivationHistoryEntry[]>();
  private readonly workspaceSearchNamespaces = new Map<string, Set<string>>();
  private readonly customConfigIds = new Set<string>();

  constructor() {
    this.hydrate();
  }

  register(config: VerticalConfig): VerticalConfig {
    const validation = validateVerticalConfig(config);
    if (!validation.ok) {
      throw new Error(`Invalid vertical config ${config.id}: ${validation.issues.join('; ')}`);
    }

    const normalized = normalizeVerticalConfig(config);
    this.configsById.set(normalized.id, normalized);
    this.persist();
    return normalized;
  }

  registerMany(configs: ReadonlyArray<VerticalConfig>): VerticalConfig[] {
    return configs.map((config) => this.register(config));
  }

  registerCustom(config: VerticalConfig): VerticalConfig {
    const normalized = normalizeVerticalConfig({
      ...config,
      source: 'community',
    });
    const registered = this.register(normalized);
    this.customConfigIds.add(registered.id);
    this.persist();
    return registered;
  }

  listCustomConfigs(): VerticalConfig[] {
    return this.listConfigs().filter((config) => this.customConfigIds.has(config.id));
  }

  listConfigs(): VerticalConfig[] {
    return Array.from(this.configsById.values()).sort((left, right) =>
      left.name.localeCompare(right.name)
    );
  }

  getConfig(verticalId: string): VerticalConfig | null {
    return this.configsById.get(verticalId) ?? null;
  }

  activate(input: VerticalActivationInput): VerticalActivation {
    const nowIso = input.nowIso ?? new Date().toISOString();
    const config = this.getConfig(input.verticalId);
    if (!config) {
      throw new Error(`Vertical ${input.verticalId} is not registered.`);
    }

    const previous = this.activeByWorkspace.get(input.workspaceId);
    const workspacePersonalNamespace = `workspace.${slug(input.workspaceId)}.personal`;
    const searchable = this.workspaceSearchNamespaces.get(input.workspaceId) ?? new Set<string>();
    searchable.add(workspacePersonalNamespace);
    for (const namespace of knowledgeNamespacesFromConfig(config)) {
      searchable.add(namespace);
    }
    this.workspaceSearchNamespaces.set(input.workspaceId, searchable);

    const activation: VerticalActivation = {
      workspaceId: input.workspaceId,
      userId: input.userId,
      verticalId: config.id,
      activatedAtIso: nowIso,
      previousVerticalId: previous?.verticalId,
      modules: modulesFromConfig(config),
      panelIds: [...config.uiPanels],
      knowledgeNamespaces: knowledgeNamespacesFromConfig(config),
      searchableNamespaces: [...searchable].sort((left, right) => left.localeCompare(right)),
    };

    this.activeByWorkspace.set(input.workspaceId, activation);
    this.appendActivationHistory({
      workspaceId: input.workspaceId,
      verticalId: config.id,
      activatedAtIso: nowIso,
    });
    this.persist();
    return this.cloneActivation(activation);
  }

  getActive(workspaceId: string): VerticalActivation | null {
    const activation = this.activeByWorkspace.get(workspaceId);
    if (!activation) return null;
    return this.cloneActivation(activation);
  }

  deactivate(workspaceId: string): void {
    this.activeByWorkspace.delete(workspaceId);
    this.persist();
  }

  listPanelIds(workspaceId: string): string[] {
    return this.activeByWorkspace.get(workspaceId)?.panelIds.slice() ?? [];
  }

  isPanelEnabled(payload: { workspaceId: string; panelId: string }): boolean {
    return this.activeByWorkspace
      .get(payload.workspaceId)
      ?.panelIds.includes(payload.panelId) ?? false;
  }

  listSearchableNamespaces(workspaceId: string): string[] {
    const namespaces = this.workspaceSearchNamespaces.get(workspaceId);
    if (!namespaces) return [];
    return [...namespaces].sort((left, right) => left.localeCompare(right));
  }

  listActivationHistory(workspaceId: string): VerticalActivationHistoryEntry[] {
    const history = this.activationHistoryByWorkspace.get(workspaceId) ?? [];
    return history.map((entry) => ({ ...entry }));
  }

  resetForTests(): void {
    this.configsById.clear();
    this.activeByWorkspace.clear();
    this.activationHistoryByWorkspace.clear();
    this.workspaceSearchNamespaces.clear();
    this.customConfigIds.clear();
    if (canUseStorage()) {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }

  private appendActivationHistory(entry: VerticalActivationHistoryEntry): void {
    const current = this.activationHistoryByWorkspace.get(entry.workspaceId) ?? [];
    const next = [entry, ...current].slice(0, ACTIVATION_HISTORY_LIMIT);
    this.activationHistoryByWorkspace.set(entry.workspaceId, next);
  }

  private cloneActivation(activation: VerticalActivation): VerticalActivation {
    return {
      ...activation,
      modules: activation.modules.map((module) => ({ ...module })),
      panelIds: [...activation.panelIds],
      knowledgeNamespaces: [...activation.knowledgeNamespaces],
      searchableNamespaces: [...activation.searchableNamespaces],
    };
  }

  private hydrate(): void {
    const persisted = readPersistedState();
    if (!persisted) return;

    for (const activation of persisted.activations) {
      const searchableNamespaces = Array.isArray(activation.searchableNamespaces)
        ? activation.searchableNamespaces
        : [...activation.knowledgeNamespaces];
      this.activeByWorkspace.set(activation.workspaceId, {
        ...activation,
        modules: activation.modules.map((module) => ({ ...module })),
        panelIds: [...activation.panelIds],
        knowledgeNamespaces: [...activation.knowledgeNamespaces],
        searchableNamespaces,
      });
    }

    for (const historyEntry of persisted.history) {
      this.appendActivationHistory(historyEntry);
    }

    for (const config of persisted.customConfigs) {
      const validation = validateVerticalConfig(config);
      if (!validation.ok) continue;
      const normalized = normalizeVerticalConfig({
        ...config,
        source: 'community',
      });
      this.configsById.set(normalized.id, normalized);
      this.customConfigIds.add(normalized.id);
    }

    for (const entry of persisted.workspaceSearchNamespaces) {
      this.workspaceSearchNamespaces.set(entry.workspaceId, new Set(entry.namespaces));
    }
  }

  private persist(): void {
    const activations = Array.from(this.activeByWorkspace.values()).map((activation) =>
      this.cloneActivation(activation)
    );
    const history = Array.from(this.activationHistoryByWorkspace.values())
      .flat()
      .sort((left, right) => Date.parse(right.activatedAtIso) - Date.parse(left.activatedAtIso))
      .slice(0, ACTIVATION_HISTORY_LIMIT)
      .map((entry) => ({ ...entry }));
    const customConfigs = this.listCustomConfigs();
    const workspaceSearchNamespaces = Array.from(this.workspaceSearchNamespaces.entries()).map(
      ([workspaceId, namespaces]) => ({
        workspaceId,
        namespaces: [...namespaces],
      })
    );

    writePersistedState({
      activations,
      history,
      customConfigs,
      workspaceSearchNamespaces,
    });
  }
}

export const verticalRuntime = new VerticalRuntime();
