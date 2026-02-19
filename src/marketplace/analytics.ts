export type MarketplaceAnalyticsSubjectType = 'template' | 'pack';
export type MarketplaceAnalyticsEventType = 'install' | 'usage' | 'uninstall';

export interface MarketplaceAnalyticsEvent {
  id: string;
  userId: string;
  subjectType: MarketplaceAnalyticsSubjectType;
  subjectId: string;
  eventType: MarketplaceAnalyticsEventType;
  createdAtIso: string;
  workspaceId?: string;
  workspaceProfileKey?: string;
}

export interface MarketplaceAnalyticsSummary {
  subjectType: MarketplaceAnalyticsSubjectType;
  subjectId: string;
  installCount: number;
  usageCount: number;
  uninstallCount: number;
  uniqueInstallUsers: number;
  activeUsers: number;
  activeUsageRate: number;
  uninstallRate: number;
  installsInWindow: number;
}

export interface TrendingPackRecord {
  packId: string;
  installsInWindow: number;
  uniqueInstallUsersInWindow: number;
  velocityScore: number;
}

const STORAGE_KEY = 'ashim.marketplace.analytics.v1';

const inMemoryStorage = new Map<string, string>();

const DAY_MS = 24 * 60 * 60 * 1000;

interface MarketplaceAnalyticsState {
  events: MarketplaceAnalyticsEvent[];
  updatedAtIso: string;
}

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const defaultState = (): MarketplaceAnalyticsState => ({
  events: [],
  updatedAtIso: new Date(0).toISOString(),
});

const isValidState = (value: unknown): value is MarketplaceAnalyticsState => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<MarketplaceAnalyticsState>;
  return Array.isArray(candidate.events);
};

const readRaw = (): string | null => {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // Fallback.
    }
  }
  return inMemoryStorage.get(STORAGE_KEY) ?? null;
};

const writeRaw = (value: string): void => {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
      return;
    } catch {
      // Fallback.
    }
  }
  inMemoryStorage.set(STORAGE_KEY, value);
};

const loadState = (): MarketplaceAnalyticsState => {
  const raw = readRaw();
  if (!raw) return defaultState();

  try {
    const parsed = JSON.parse(raw);
    if (!isValidState(parsed)) return defaultState();
    return {
      events: [...parsed.events],
      updatedAtIso:
        typeof parsed.updatedAtIso === 'string' ? parsed.updatedAtIso : new Date().toISOString(),
    };
  } catch {
    return defaultState();
  }
};

const saveState = (state: MarketplaceAnalyticsState): void => {
  writeRaw(
    JSON.stringify({
      ...state,
      events: [...state.events],
      updatedAtIso: new Date().toISOString(),
    } satisfies MarketplaceAnalyticsState)
  );
};

const toMs = (iso: string): number => {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const withinWindow = (createdAtIso: string, nowIso: string, windowDays: number): boolean => {
  const age = toMs(nowIso) - toMs(createdAtIso);
  if (age < 0) return true;
  return age <= Math.max(1, windowDays) * DAY_MS;
};

const listSubjectEvents = (payload: {
  subjectType: MarketplaceAnalyticsSubjectType;
  subjectId: string;
}): MarketplaceAnalyticsEvent[] => {
  return loadState()
    .events
    .filter((event) => event.subjectType === payload.subjectType)
    .filter((event) => event.subjectId === payload.subjectId)
    .sort((left, right) => toMs(left.createdAtIso) - toMs(right.createdAtIso));
};

const uniqueUserCount = (events: ReadonlyArray<MarketplaceAnalyticsEvent>): number => {
  return new Set(events.map((event) => event.userId)).size;
};

const activeUsersForSubject = (events: ReadonlyArray<MarketplaceAnalyticsEvent>): number => {
  const latestByUser = new Map<string, MarketplaceAnalyticsEvent>();
  for (const event of events) {
    latestByUser.set(event.userId, event);
  }

  let active = 0;
  for (const event of latestByUser.values()) {
    if (event.eventType !== 'uninstall') {
      active += 1;
    }
  }
  return active;
};

export const recordMarketplaceAnalyticsEvent = (payload: {
  userId: string;
  subjectType: MarketplaceAnalyticsSubjectType;
  subjectId: string;
  eventType: MarketplaceAnalyticsEventType;
  workspaceId?: string;
  workspaceProfileKey?: string;
  nowIso?: string;
}): MarketplaceAnalyticsEvent => {
  const nowIso = payload.nowIso ?? new Date().toISOString();
  const event: MarketplaceAnalyticsEvent = {
    id: makeId('market-analytics'),
    userId: payload.userId,
    subjectType: payload.subjectType,
    subjectId: payload.subjectId,
    eventType: payload.eventType,
    createdAtIso: nowIso,
    workspaceId: payload.workspaceId,
    workspaceProfileKey: payload.workspaceProfileKey,
  };

  const state = loadState();
  saveState({
    ...state,
    events: [...state.events, event],
    updatedAtIso: nowIso,
  });

  return event;
};

export const recordMarketplaceInstallEvent = (payload: {
  userId: string;
  subjectType: MarketplaceAnalyticsSubjectType;
  subjectId: string;
  workspaceId?: string;
  workspaceProfileKey?: string;
  nowIso?: string;
}): MarketplaceAnalyticsEvent => {
  return recordMarketplaceAnalyticsEvent({
    ...payload,
    eventType: 'install',
  });
};

export const recordMarketplaceUsageEvent = (payload: {
  userId: string;
  subjectType: MarketplaceAnalyticsSubjectType;
  subjectId: string;
  workspaceId?: string;
  workspaceProfileKey?: string;
  nowIso?: string;
}): MarketplaceAnalyticsEvent => {
  return recordMarketplaceAnalyticsEvent({
    ...payload,
    eventType: 'usage',
  });
};

export const recordMarketplaceUninstallEvent = (payload: {
  userId: string;
  subjectType: MarketplaceAnalyticsSubjectType;
  subjectId: string;
  workspaceId?: string;
  workspaceProfileKey?: string;
  nowIso?: string;
}): MarketplaceAnalyticsEvent => {
  return recordMarketplaceAnalyticsEvent({
    ...payload,
    eventType: 'uninstall',
  });
};

export const listMarketplaceAnalyticsEvents = (payload: {
  subjectType?: MarketplaceAnalyticsSubjectType | 'all';
  subjectId?: string;
  eventType?: MarketplaceAnalyticsEventType | 'all';
  userId?: string;
  workspaceProfileKey?: string;
  limit?: number;
} = {}): MarketplaceAnalyticsEvent[] => {
  const limit = Math.max(1, payload.limit ?? 400);
  const subjectType = payload.subjectType ?? 'all';
  const eventType = payload.eventType ?? 'all';

  return loadState()
    .events
    .filter((event) => (subjectType === 'all' ? true : event.subjectType === subjectType))
    .filter((event) => (payload.subjectId ? event.subjectId === payload.subjectId : true))
    .filter((event) => (eventType === 'all' ? true : event.eventType === eventType))
    .filter((event) => (payload.userId ? event.userId === payload.userId : true))
    .filter((event) =>
      payload.workspaceProfileKey ? event.workspaceProfileKey === payload.workspaceProfileKey : true
    )
    .sort((left, right) => toMs(right.createdAtIso) - toMs(left.createdAtIso))
    .slice(0, limit);
};

export const summarizeMarketplaceSubject = (payload: {
  subjectType: MarketplaceAnalyticsSubjectType;
  subjectId: string;
  nowIso?: string;
  windowDays?: number;
}): MarketplaceAnalyticsSummary => {
  const nowIso = payload.nowIso ?? new Date().toISOString();
  const windowDays = Math.max(1, payload.windowDays ?? 7);
  const events = listSubjectEvents({
    subjectType: payload.subjectType,
    subjectId: payload.subjectId,
  });

  const installs = events.filter((event) => event.eventType === 'install');
  const usage = events.filter((event) => event.eventType === 'usage');
  const uninstalls = events.filter((event) => event.eventType === 'uninstall');
  const installsInWindow = installs.filter((event) => withinWindow(event.createdAtIso, nowIso, windowDays));

  const installCount = installs.length;
  const usageCount = usage.length;
  const uninstallCount = uninstalls.length;
  const activeUsers = activeUsersForSubject(events);

  return {
    subjectType: payload.subjectType,
    subjectId: payload.subjectId,
    installCount,
    usageCount,
    uninstallCount,
    uniqueInstallUsers: uniqueUserCount(installs),
    activeUsers,
    activeUsageRate: Number(clamp(installCount === 0 ? 0 : usageCount / installCount, 0, 1).toFixed(4)),
    uninstallRate: Number(clamp(installCount === 0 ? 0 : uninstallCount / installCount, 0, 1).toFixed(4)),
    installsInWindow: installsInWindow.length,
  };
};

export const getPackSocialProof = (payload: {
  packId: string;
  nowIso?: string;
  windowDays?: number;
}) => {
  const summary = summarizeMarketplaceSubject({
    subjectType: 'pack',
    subjectId: payload.packId,
    nowIso: payload.nowIso,
    windowDays: payload.windowDays,
  });

  return {
    packId: payload.packId,
    usersUsing: summary.activeUsers,
    uniqueInstallUsers: summary.uniqueInstallUsers,
    totalInstalls: summary.installCount,
    installsInWindow: summary.installsInWindow,
    uninstallRate: summary.uninstallRate,
    activeUsageRate: summary.activeUsageRate,
  };
};

export const listTrendingPacks = (payload: {
  nowIso?: string;
  windowDays?: number;
  minInstalls?: number;
  limit?: number;
} = {}): TrendingPackRecord[] => {
  const nowIso = payload.nowIso ?? new Date().toISOString();
  const windowDays = Math.max(1, payload.windowDays ?? 7);
  const minInstalls = Math.max(1, payload.minInstalls ?? 5);
  const limit = Math.max(1, payload.limit ?? 6);

  const installs = listMarketplaceAnalyticsEvents({
    subjectType: 'pack',
    eventType: 'install',
    limit: 5000,
  }).filter((event) => withinWindow(event.createdAtIso, nowIso, windowDays));

  const byPack = new Map<string, MarketplaceAnalyticsEvent[]>();
  for (const event of installs) {
    const current = byPack.get(event.subjectId) ?? [];
    current.push(event);
    byPack.set(event.subjectId, current);
  }

  const trending: TrendingPackRecord[] = [];
  for (const [packId, events] of byPack.entries()) {
    const installsInWindow = events.length;
    if (installsInWindow < minInstalls) continue;
    const uniqueInstallUsersInWindow = uniqueUserCount(events);
    const velocityScore = Number((installsInWindow / windowDays).toFixed(4));
    trending.push({
      packId,
      installsInWindow,
      uniqueInstallUsersInWindow,
      velocityScore,
    });
  }

  return trending
    .sort((left, right) => {
      if (left.velocityScore !== right.velocityScore) return right.velocityScore - left.velocityScore;
      if (left.installsInWindow !== right.installsInWindow) {
        return right.installsInWindow - left.installsInWindow;
      }
      return left.packId.localeCompare(right.packId);
    })
    .slice(0, limit);
};

export const getPeerPackAdoption = (payload: {
  packId: string;
  workspaceProfileKey?: string;
  nowIso?: string;
  windowDays?: number;
}): {
  peerPackInstalls: number;
  peerTotalInstalls: number;
  peerAdoptionScore: number;
} => {
  if (!payload.workspaceProfileKey) {
    return {
      peerPackInstalls: 0,
      peerTotalInstalls: 0,
      peerAdoptionScore: 0,
    };
  }

  const nowIso = payload.nowIso ?? new Date().toISOString();
  const windowDays = Math.max(1, payload.windowDays ?? 30);

  const peerInstalls = listMarketplaceAnalyticsEvents({
    subjectType: 'pack',
    eventType: 'install',
    workspaceProfileKey: payload.workspaceProfileKey,
    limit: 5000,
  }).filter((event) => withinWindow(event.createdAtIso, nowIso, windowDays));

  const peerPackInstalls = peerInstalls.filter((event) => event.subjectId === payload.packId).length;
  const peerTotalInstalls = peerInstalls.length;
  const peerAdoptionScore = Number(
    clamp(peerTotalInstalls === 0 ? 0 : peerPackInstalls / peerTotalInstalls, 0, 1).toFixed(4)
  );

  return {
    peerPackInstalls,
    peerTotalInstalls,
    peerAdoptionScore,
  };
};

export const resetMarketplaceAnalyticsForTests = (): void => {
  saveState(defaultState());
};
