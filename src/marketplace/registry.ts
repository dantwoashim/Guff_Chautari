import type { TemplateItem, TemplateKind } from './types';
import { validateTemplate } from './validation';

const STORAGE_KEY = 'ashim.marketplace.registry.v1';

const inMemoryStorage = new Map<string, string>();

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim();

const stableHash = (value: string): string => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(16);
};

const toMs = (iso: string): number => {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const readRaw = (key: string): string | null => {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      // Fallback to in-memory cache.
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
      // Fallback to in-memory cache.
    }
  }
  inMemoryStorage.set(key, value);
};

const parseSemver = (version: string): [number, number, number] | null => {
  const match = version.trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
};

const compareSemver = (left: string, right: string): number => {
  const leftParsed = parseSemver(left);
  const rightParsed = parseSemver(right);
  if (!leftParsed || !rightParsed) {
    return left.localeCompare(right, undefined, { numeric: true });
  }

  for (let index = 0; index < 3; index += 1) {
    if (leftParsed[index] !== rightParsed[index]) {
      return leftParsed[index] - rightParsed[index];
    }
  }
  return 0;
};

const compareSemverDesc = (left: string, right: string): number => compareSemver(right, left);

const computeTemplateFingerprint = (template: TemplateItem): string => {
  const serialized = JSON.stringify(template);
  return stableHash(serialized);
};

export type RegistryPackageStatus = 'active' | 'deprecated';

export interface RegistryPackage {
  id: string;
  templateId: string;
  version: string;
  kind: TemplateKind;
  publisherUserId: string;
  status: RegistryPackageStatus;
  publishedAtIso: string;
  updatedAtIso: string;
  dedupeHash: string;
  deprecationReason?: string;
  deprecatedByVersion?: string;
  template: TemplateItem;
}

interface RegistryState {
  packages: RegistryPackage[];
  updatedAtIso: string;
}

const defaultState = (): RegistryState => ({
  packages: [],
  updatedAtIso: new Date(0).toISOString(),
});

const isValidState = (value: unknown): value is RegistryState => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<RegistryState>;
  return Array.isArray(candidate.packages);
};

const loadState = (): RegistryState => {
  const raw = readRaw(STORAGE_KEY);
  if (!raw) return defaultState();

  try {
    const parsed = JSON.parse(raw);
    if (!isValidState(parsed)) return defaultState();
    return {
      packages: [...parsed.packages],
      updatedAtIso:
        typeof parsed.updatedAtIso === 'string' ? parsed.updatedAtIso : new Date().toISOString(),
    };
  } catch {
    return defaultState();
  }
};

const saveState = (state: RegistryState): void => {
  writeRaw(
    STORAGE_KEY,
    JSON.stringify({
      packages: [...state.packages],
      updatedAtIso: new Date().toISOString(),
    } satisfies RegistryState)
  );
};

const upsertPackages = (packages: ReadonlyArray<RegistryPackage>): void => {
  saveState({
    packages: [...packages],
    updatedAtIso: new Date().toISOString(),
  });
};

const latestKnownVersion = (entries: ReadonlyArray<RegistryPackage>): string | null => {
  if (entries.length === 0) return null;
  const sorted = [...entries].sort((left, right) => compareSemverDesc(left.version, right.version));
  return sorted[0].version;
};

export const listRegistryPackages = (payload: {
  templateId?: string;
  publisherUserId?: string;
  kind?: TemplateKind | 'all';
  includeDeprecated?: boolean;
  search?: string;
} = {}): RegistryPackage[] => {
  const includeDeprecated = payload.includeDeprecated ?? true;
  const kind = payload.kind ?? 'all';
  const search = normalizeWhitespace(payload.search ?? '').toLowerCase();

  return loadState()
    .packages
    .filter((entry) => (payload.templateId ? entry.templateId === payload.templateId : true))
    .filter((entry) => (payload.publisherUserId ? entry.publisherUserId === payload.publisherUserId : true))
    .filter((entry) => (kind === 'all' ? true : entry.kind === kind))
    .filter((entry) => (includeDeprecated ? true : entry.status === 'active'))
    .filter((entry) => {
      if (!search) return true;
      const haystack = [
        entry.template.metadata.name,
        entry.template.metadata.description,
        entry.template.metadata.author,
        entry.template.metadata.tags.join(' '),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(search);
    })
    .sort((left, right) => {
      if (left.templateId !== right.templateId) {
        return left.templateId.localeCompare(right.templateId);
      }
      const versionCompare = compareSemverDesc(left.version, right.version);
      if (versionCompare !== 0) return versionCompare;
      return toMs(right.publishedAtIso) - toMs(left.publishedAtIso);
    });
};

export const getRegistryPackage = (payload: {
  templateId: string;
  version?: string;
  includeDeprecated?: boolean;
}): RegistryPackage | null => {
  const entries = listRegistryPackages({
    templateId: payload.templateId,
    includeDeprecated: payload.includeDeprecated ?? true,
  });
  if (entries.length === 0) return null;
  if (!payload.version) return entries[0];
  return entries.find((entry) => entry.version === payload.version) ?? null;
};

const getLatestActiveByTemplateId = (templateId: string): RegistryPackage | null => {
  const active = listRegistryPackages({
    templateId,
    includeDeprecated: false,
  });
  if (active.length === 0) return null;
  return active[0];
};

export const listRegistryActiveTemplates = (payload: {
  kind?: TemplateKind | 'all';
  search?: string;
} = {}): TemplateItem[] => {
  const kind = payload.kind ?? 'all';
  const search = normalizeWhitespace(payload.search ?? '').toLowerCase();

  const latestByTemplateId = new Map<string, RegistryPackage>();
  for (const entry of listRegistryPackages({ includeDeprecated: false })) {
    const existing = latestByTemplateId.get(entry.templateId);
    if (!existing || compareSemver(entry.version, existing.version) > 0) {
      latestByTemplateId.set(entry.templateId, entry);
    }
  }

  return [...latestByTemplateId.values()]
    .filter((entry) => (kind === 'all' ? true : entry.kind === kind))
    .filter((entry) => {
      if (!search) return true;
      const haystack = [
        entry.template.metadata.name,
        entry.template.metadata.description,
        entry.template.metadata.author,
        entry.template.metadata.tags.join(' '),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(search);
    })
    .map((entry) => entry.template)
    .sort((left, right) => left.metadata.name.localeCompare(right.metadata.name));
};

export const publishTemplateToRegistry = (payload: {
  publisherUserId: string;
  template: TemplateItem;
  nowIso?: string;
}): {
  entry: RegistryPackage;
  deduped: boolean;
  deprecatedVersions: string[];
} => {
  const validation = validateTemplate(payload.template);
  if (!validation.ok) {
    throw new Error(`Template validation failed: ${validation.issues.join('; ')}`);
  }

  const nowIso = payload.nowIso ?? new Date().toISOString();
  const templateId = payload.template.metadata.id;
  const version = payload.template.metadata.version;
  const dedupeHash = computeTemplateFingerprint(payload.template);
  const state = loadState();

  const existingSameVersion = state.packages.find(
    (entry) => entry.templateId === templateId && entry.version === version
  );
  if (existingSameVersion) {
    if (existingSameVersion.dedupeHash === dedupeHash) {
      return {
        entry: existingSameVersion,
        deduped: true,
        deprecatedVersions: [],
      };
    }

    throw new Error(
      `Template ${templateId}@${version} already exists with different content. Publish a new version instead.`
    );
  }

  const existingForTemplate = state.packages.filter((entry) => entry.templateId === templateId);
  const latestVersion = latestKnownVersion(existingForTemplate);
  const hasNewerVersion = latestVersion ? compareSemver(latestVersion, version) > 0 : false;

  const nextEntry: RegistryPackage = {
    id: makeId(`registry-${templateId}`),
    templateId,
    version,
    kind: payload.template.kind,
    publisherUserId: payload.publisherUserId,
    status: hasNewerVersion ? 'deprecated' : 'active',
    publishedAtIso: nowIso,
    updatedAtIso: nowIso,
    dedupeHash,
    deprecationReason: hasNewerVersion ? `Superseded by newer active version ${latestVersion}.` : undefined,
    deprecatedByVersion: hasNewerVersion ? latestVersion ?? undefined : undefined,
    template: {
      ...payload.template,
      metadata: {
        ...payload.template.metadata,
        updatedAtIso: payload.template.metadata.updatedAtIso || nowIso,
      },
    },
  };

  const deprecatedVersions: string[] = [];
  const nextPackages = state.packages.map((entry) => {
    if (entry.templateId !== templateId) return entry;
    if (entry.status !== 'active') return entry;
    if (compareSemver(entry.version, version) >= 0) return entry;

    deprecatedVersions.push(entry.version);
    return {
      ...entry,
      status: 'deprecated' as const,
      updatedAtIso: nowIso,
      deprecatedByVersion: version,
      deprecationReason: `Auto-deprecated after ${templateId}@${version} was published.`,
    };
  });

  nextPackages.push(nextEntry);
  upsertPackages(nextPackages);

  return {
    entry: nextEntry,
    deduped: false,
    deprecatedVersions,
  };
};

export const deprecateRegistryPackage = (payload: {
  templateId: string;
  version: string;
  reason?: string;
  nowIso?: string;
}): RegistryPackage => {
  const nowIso = payload.nowIso ?? new Date().toISOString();
  const state = loadState();
  let updated: RegistryPackage | null = null;

  const nextPackages = state.packages.map((entry) => {
    if (entry.templateId !== payload.templateId || entry.version !== payload.version) return entry;
    updated = {
      ...entry,
      status: 'deprecated',
      updatedAtIso: nowIso,
      deprecationReason: payload.reason || 'Manually deprecated.',
    };
    return updated;
  });

  if (!updated) {
    throw new Error(`Registry package ${payload.templateId}@${payload.version} not found.`);
  }

  upsertPackages(nextPackages);
  return updated;
};

export const getLatestRegistryVersion = (templateId: string): string | null => {
  const latest = getLatestActiveByTemplateId(templateId);
  return latest?.version ?? null;
};

export const resetRegistryForTests = (): void => {
  saveState(defaultState());
};
