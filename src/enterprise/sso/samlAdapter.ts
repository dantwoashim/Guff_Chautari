import type { SAMLConfig, SSOIdentity } from './types';

export interface ParsedSamlAssertion {
  identity: SSOIdentity;
  issuedAtIso: string;
  expiresAtIso: string;
  audience?: string;
}

const normalize = (value: string): string =>
  value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const decodeAssertionPayload = (assertion: string): Record<string, unknown> => {
  const trimmed = assertion.trim();
  if (!trimmed) {
    throw new Error('SAML assertion is empty.');
  }

  const parseJson = (raw: string): Record<string, unknown> => {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('SAML assertion payload must be an object.');
    }
    return parsed as Record<string, unknown>;
  };

  if (trimmed.startsWith('{')) {
    return parseJson(trimmed);
  }

  try {
    return parseJson(atob(trimmed));
  } catch {
    // Fall through.
  }

  try {
    return parseJson(Buffer.from(trimmed, 'base64').toString('utf8'));
  } catch {
    throw new Error('Unable to decode SAML assertion payload.');
  }
};

const readString = (payload: Record<string, unknown>, key: string): string | undefined => {
  const value = payload[key];
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
};

const readGroups = (payload: Record<string, unknown>): string[] => {
  const value = payload.groups;
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
};

export const parseSamlAssertion = (payload: {
  assertion: string;
  nowIso?: string;
  config?: SAMLConfig;
}): ParsedSamlAssertion => {
  const nowIso = payload.nowIso ?? new Date().toISOString();
  const decoded = decodeAssertionPayload(payload.assertion);

  const email = readString(decoded, 'email');
  if (!email) {
    throw new Error('SAML assertion missing email claim.');
  }

  const issuedAtIso = readString(decoded, 'issuedAtIso') ?? nowIso;
  const expiresAtIso =
    readString(decoded, 'expiresAtIso') ??
    new Date(Date.parse(issuedAtIso) + 60 * 60 * 1000).toISOString();

  if (Date.parse(expiresAtIso) <= Date.parse(nowIso)) {
    throw new Error('SAML assertion is expired.');
  }

  const audience = readString(decoded, 'audience');
  if (payload.config?.audience && audience && normalize(payload.config.audience) !== normalize(audience)) {
    throw new Error('SAML audience mismatch.');
  }

  const providerUserId = readString(decoded, 'providerUserId') ?? readString(decoded, 'nameId');

  return {
    identity: {
      userId: readString(decoded, 'userId') ?? providerUserId ?? email,
      email,
      displayName: readString(decoded, 'displayName'),
      groups: readGroups(decoded),
      providerUserId,
    },
    issuedAtIso,
    expiresAtIso,
    audience,
  };
};
