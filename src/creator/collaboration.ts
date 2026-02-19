import {
  submitTemplateContribution,
  type TemplateItem,
  type TemplateSubmission,
  type TemplateSubmitterProfile,
} from '../marketplace';

export type CreatorCollaborationRole =
  | 'primary_author'
  | 'co_author'
  | 'editor'
  | 'researcher'
  | 'qa';

export interface CreatorAttributionMember {
  creatorUserId: string;
  displayName: string;
  roleLabel: CreatorCollaborationRole;
  isPrimary: boolean;
}

export interface CollaborativeCreatorPack {
  id: string;
  name: string;
  description?: string;
  primaryCreatorUserId: string;
  attribution: CreatorAttributionMember[];
  templateIds: string[];
  createdAtIso: string;
  updatedAtIso: string;
}

export interface CollaborativeReviewRecord {
  id: string;
  submissionId: string;
  packId: string;
  templateId: string;
  attribution: CreatorAttributionMember[];
  createdAtIso: string;
}

interface CollaborationState {
  packs: CollaborativeCreatorPack[];
  reviewRecords: CollaborativeReviewRecord[];
  updatedAtIso: string;
}

const STORAGE_KEY = 'ashim.creator.collaboration.v1';

const inMemoryStorage = new Map<string, string>();

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

const defaultState = (): CollaborationState => ({
  packs: [],
  reviewRecords: [],
  updatedAtIso: new Date(0).toISOString(),
});

const readRaw = (): string | null => {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // Fall through to in-memory storage.
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
      // Fall through to in-memory storage.
    }
  }
  inMemoryStorage.set(STORAGE_KEY, value);
};

const isValidState = (value: unknown): value is CollaborationState => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<CollaborationState>;
  return Array.isArray(candidate.packs) && Array.isArray(candidate.reviewRecords);
};

const loadState = (): CollaborationState => {
  const raw = readRaw();
  if (!raw) return defaultState();

  try {
    const parsed = JSON.parse(raw);
    if (!isValidState(parsed)) return defaultState();
    return {
      packs: [...parsed.packs],
      reviewRecords: [...parsed.reviewRecords],
      updatedAtIso:
        typeof parsed.updatedAtIso === 'string' ? parsed.updatedAtIso : new Date().toISOString(),
    };
  } catch {
    return defaultState();
  }
};

const saveState = (state: CollaborationState): void => {
  writeRaw(
    JSON.stringify({
      ...state,
      packs: [...state.packs],
      reviewRecords: [...state.reviewRecords],
      updatedAtIso: new Date().toISOString(),
    } satisfies CollaborationState)
  );
};

const updateState = (updater: (state: CollaborationState) => CollaborationState): CollaborationState => {
  const current = loadState();
  const next = updater(current);
  saveState(next);
  return next;
};

const normalizeAttribution = (payload: {
  primaryCreatorUserId: string;
  primaryDisplayName?: string;
  contributors?: ReadonlyArray<{
    creatorUserId: string;
    displayName?: string;
    roleLabel: Exclude<CreatorCollaborationRole, 'primary_author'>;
  }>;
}): CreatorAttributionMember[] => {
  const byCreatorId = new Map<string, CreatorAttributionMember>();

  byCreatorId.set(payload.primaryCreatorUserId, {
    creatorUserId: payload.primaryCreatorUserId,
    displayName: payload.primaryDisplayName?.trim() || payload.primaryCreatorUserId,
    roleLabel: 'primary_author',
    isPrimary: true,
  });

  for (const contributor of payload.contributors ?? []) {
    const creatorUserId = contributor.creatorUserId.trim();
    if (!creatorUserId) continue;

    const existing = byCreatorId.get(creatorUserId);
    if (existing?.isPrimary) continue;

    byCreatorId.set(creatorUserId, {
      creatorUserId,
      displayName: contributor.displayName?.trim() || creatorUserId,
      roleLabel: contributor.roleLabel,
      isPrimary: false,
    });
  }

  return [...byCreatorId.values()].sort((left, right) => {
    if (left.isPrimary !== right.isPrimary) return left.isPrimary ? -1 : 1;
    return left.creatorUserId.localeCompare(right.creatorUserId);
  });
};

const normalizeTemplateIds = (templateIds: ReadonlyArray<string>): string[] =>
  [...new Set(templateIds.map((templateId) => templateId.trim()).filter((templateId) => templateId.length > 0))]
    .sort((left, right) => left.localeCompare(right));

export const createCollaborativeCreatorPack = (payload: {
  packId?: string;
  name: string;
  description?: string;
  primaryCreatorUserId: string;
  primaryDisplayName?: string;
  contributors?: ReadonlyArray<{
    creatorUserId: string;
    displayName?: string;
    roleLabel: Exclude<CreatorCollaborationRole, 'primary_author'>;
  }>;
  templateIds?: ReadonlyArray<string>;
  nowIso?: string;
}): CollaborativeCreatorPack => {
  const nowIso = payload.nowIso ?? new Date().toISOString();
  const packId = payload.packId?.trim() || makeId('creator-pack');
  const attribution = normalizeAttribution({
    primaryCreatorUserId: payload.primaryCreatorUserId,
    primaryDisplayName: payload.primaryDisplayName,
    contributors: payload.contributors,
  });

  if (attribution.length < 2) {
    throw new Error('Collaborative packs require at least one co-author in addition to the primary creator.');
  }

  const pack: CollaborativeCreatorPack = {
    id: packId,
    name: payload.name.trim(),
    description: payload.description?.trim() || undefined,
    primaryCreatorUserId: payload.primaryCreatorUserId,
    attribution,
    templateIds: normalizeTemplateIds(payload.templateIds ?? []),
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  updateState((state) => {
    const nextPacks = [
      pack,
      ...state.packs.filter((existing) => existing.id !== pack.id),
    ];
    return {
      ...state,
      packs: nextPacks,
      updatedAtIso: nowIso,
    };
  });

  return pack;
};

export const getCollaborativeCreatorPackById = (packId: string): CollaborativeCreatorPack | null => {
  return loadState().packs.find((pack) => pack.id === packId) ?? null;
};

export const listCollaborativeCreatorPacks = (payload: {
  creatorUserId?: string;
} = {}): CollaborativeCreatorPack[] => {
  const packs = loadState().packs;
  return packs
    .filter((pack) =>
      payload.creatorUserId
        ? pack.attribution.some((member) => member.creatorUserId === payload.creatorUserId)
        : true
    )
    .sort((left, right) => right.createdAtIso.localeCompare(left.createdAtIso));
};

export const upsertCollaborativePackTemplate = (payload: {
  packId: string;
  templateId: string;
  nowIso?: string;
}): CollaborativeCreatorPack => {
  const nowIso = payload.nowIso ?? new Date().toISOString();
  const state = updateState((current) => {
    const nextPacks = current.packs.map((pack) => {
      if (pack.id !== payload.packId) return pack;
      const templateIds = normalizeTemplateIds([...pack.templateIds, payload.templateId]);
      return {
        ...pack,
        templateIds,
        updatedAtIso: nowIso,
      };
    });
    return {
      ...current,
      packs: nextPacks,
      updatedAtIso: nowIso,
    };
  });

  const updatedPack = state.packs.find((pack) => pack.id === payload.packId);
  if (!updatedPack) {
    throw new Error(`Collaborative pack ${payload.packId} not found.`);
  }
  return updatedPack;
};

export interface CollaborativeReviewSubmissionResult {
  pack: CollaborativeCreatorPack;
  submission: TemplateSubmission;
  attribution: CreatorAttributionMember[];
}

export const submitCollaborativeTemplateForReview = (payload: {
  userId: string;
  packId: string;
  template: TemplateItem;
  submitterProfile?: Partial<TemplateSubmitterProfile>;
  nowIso?: string;
}): CollaborativeReviewSubmissionResult => {
  const nowIso = payload.nowIso ?? new Date().toISOString();
  const pack = getCollaborativeCreatorPackById(payload.packId);
  if (!pack) {
    throw new Error(`Collaborative pack ${payload.packId} not found.`);
  }

  const primaryCreator = pack.attribution.find((member) => member.isPrimary) ?? pack.attribution[0];
  const submission = submitTemplateContribution({
    userId: payload.userId,
    template: payload.template,
    submitterProfile: {
      userId: primaryCreator.creatorUserId,
      displayName: primaryCreator.displayName,
      ...payload.submitterProfile,
    },
  });

  upsertCollaborativePackTemplate({
    packId: pack.id,
    templateId: payload.template.metadata.id,
    nowIso,
  });

  const reviewRecord: CollaborativeReviewRecord = {
    id: makeId('creator-collab-review'),
    submissionId: submission.id,
    packId: pack.id,
    templateId: payload.template.metadata.id,
    attribution: [...pack.attribution],
    createdAtIso: nowIso,
  };

  updateState((state) => ({
    ...state,
    reviewRecords: [reviewRecord, ...state.reviewRecords.filter((record) => record.id !== reviewRecord.id)],
    updatedAtIso: nowIso,
  }));

  return {
    pack,
    submission,
    attribution: [...pack.attribution],
  };
};

export const getCollaborativeSubmissionAttribution = (payload: {
  submissionId: string;
}): CreatorAttributionMember[] | null => {
  const record = loadState().reviewRecords.find((item) => item.submissionId === payload.submissionId);
  return record ? [...record.attribution] : null;
};

export const listCollaborativeReviewRecords = (payload: {
  packId?: string;
  creatorUserId?: string;
} = {}): CollaborativeReviewRecord[] => {
  return loadState()
    .reviewRecords
    .filter((record) => (payload.packId ? record.packId === payload.packId : true))
    .filter((record) =>
      payload.creatorUserId
        ? record.attribution.some((member) => member.creatorUserId === payload.creatorUserId)
        : true
    )
    .sort((left, right) => right.createdAtIso.localeCompare(left.createdAtIso));
};

export const resetCreatorCollaborationForTests = (): void => {
  saveState(defaultState());
};
