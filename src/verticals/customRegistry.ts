import type { VerticalConfig } from './types';
import { verticalRuntime } from './runtime';
import { normalizeVerticalConfig, validateVerticalConfig } from './validation';

const STORAGE_KEY = 'ashim.verticals.custom-registry.v1';

const canUseStorage = (): boolean => {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
};

const readRegistry = (): VerticalConfig[] => {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as VerticalConfig[]) : [];
  } catch {
    return [];
  }
};

const writeRegistry = (configs: ReadonlyArray<VerticalConfig>): void => {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
  } catch {
    // Ignore quota failures and keep runtime non-blocking.
  }
};

export interface RegisterCustomVerticalResult {
  ok: boolean;
  config?: VerticalConfig;
  issues?: string[];
}

export const listCustomVerticalRegistry = (): VerticalConfig[] => {
  return readRegistry();
};

export const registerCustomVerticalConfig = (payload: {
  config: VerticalConfig;
  createdByUserId: string;
  nowIso?: string;
}): RegisterCustomVerticalResult => {
  const normalized = normalizeVerticalConfig({
    ...payload.config,
    source: 'community',
    createdByUserId: payload.createdByUserId,
    version: payload.config.version ?? '1.0.0',
  });
  const validation = validateVerticalConfig(normalized);
  if (!validation.ok) {
    return {
      ok: false,
      issues: validation.issues,
    };
  }

  const registry = readRegistry().filter((entry) => entry.id !== normalized.id);
  const next = [normalized, ...registry];
  writeRegistry(next);
  verticalRuntime.registerCustom(normalized);

  return {
    ok: true,
    config: normalized,
  };
};
