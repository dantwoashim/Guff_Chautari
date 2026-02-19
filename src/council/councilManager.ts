import type { Council, CouncilMember, CreateCouncilInput } from './types';
import { CouncilStore, councilStore } from './store';

const MIN_MEMBERS = 3;
const MAX_MEMBERS = 7;

const hashString = (value: string): number => {
  let hash = 7;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0;
  }
  return Math.abs(hash);
};

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

const toCouncilMember = (input: {
  personaId: string;
  name: string;
  roleHint?: string;
  systemInstruction?: string;
}): CouncilMember => {
  const seed = hashString(`${input.personaId}:${input.name}:${input.roleHint ?? ''}`);
  return {
    id: makeId('member'),
    personaId: input.personaId,
    name: input.name.trim(),
    roleHint: input.roleHint?.trim() || undefined,
    systemInstruction: input.systemInstruction?.trim() || undefined,
    stanceSeed: seed,
  };
};

const validateMemberSet = (members: ReadonlyArray<CouncilMember>): void => {
  if (members.length < MIN_MEMBERS || members.length > MAX_MEMBERS) {
    throw new Error(`Council requires ${MIN_MEMBERS}-${MAX_MEMBERS} members.`);
  }

  const seen = new Set<string>();
  for (const member of members) {
    if (!member.personaId.trim()) {
      throw new Error('Each council member must have a personaId.');
    }
    if (!member.name.trim()) {
      throw new Error('Each council member must have a name.');
    }
    if (seen.has(member.personaId)) {
      throw new Error('Duplicate persona selected in council.');
    }
    seen.add(member.personaId);
  }
};

export const createCouncil = (
  input: CreateCouncilInput,
  store: CouncilStore = councilStore
): Council => {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const members = input.members.map(toCouncilMember);
  validateMemberSet(members);

  if (!input.userId.trim()) {
    throw new Error('userId is required.');
  }
  if (!input.name.trim()) {
    throw new Error('Council name is required.');
  }

  const council: Council = {
    id: makeId('council'),
    userId: input.userId,
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
    members,
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  store.update(input.userId, (state) => ({
    ...state,
    councils: [council, ...state.councils.filter((item) => item.id !== council.id)],
  }));

  return council;
};

export const listCouncils = (userId: string, store: CouncilStore = councilStore): Council[] => {
  return store.load(userId).councils;
};

export const getCouncilById = (
  userId: string,
  councilId: string,
  store: CouncilStore = councilStore
): Council | null => {
  return store.load(userId).councils.find((council) => council.id === councilId) ?? null;
};

export const saveCouncil = (
  userId: string,
  council: Council,
  store: CouncilStore = councilStore
): Council => {
  validateMemberSet(council.members);

  const normalized: Council = {
    ...council,
    userId,
    name: council.name.trim(),
    description: council.description?.trim() || undefined,
    updatedAtIso: new Date().toISOString(),
  };

  store.update(userId, (state) => ({
    ...state,
    councils: [normalized, ...state.councils.filter((item) => item.id !== normalized.id)],
  }));

  return normalized;
};
