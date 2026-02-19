import type { OIDCConfig, SSOIdentity } from './types';

export interface ParsedOidcToken {
  identity: SSOIdentity;
  issuedAtIso: string;
  expiresAtIso: string;
  issuer?: string;
  audience?: string;
}

const normalize = (value: string): string => value.trim().toLowerCase();

const toBase64Text = (value: string): string => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4;
  if (padding === 0) return normalized;
  return normalized + '='.repeat(4 - padding);
};

const decodePayloadSegment = (segment: string): Record<string, unknown> => {
  try {
    const decoded = atob(toBase64Text(segment));
    const parsed = JSON.parse(decoded);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('OIDC payload must be an object.');
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error('Unable to decode OIDC token payload.');
  }
};

const decodeTokenPayload = (token: string): Record<string, unknown> => {
  const trimmed = token.trim();
  if (!trimmed) throw new Error('OIDC token is empty.');

  if (trimmed.startsWith('{')) {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('OIDC token payload must be an object.');
    }
    return parsed as Record<string, unknown>;
  }

  const parts = trimmed.split('.');
  if (parts.length >= 2) {
    return decodePayloadSegment(parts[1]);
  }

  return decodePayloadSegment(trimmed);
};

const readString = (payload: Record<string, unknown>, key: string): string | undefined => {
  const value = payload[key];
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
};

const readGroups = (payload: Record<string, unknown>): string[] => {
  const raw = payload.groups;
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
};

export const parseOidcIdToken = (payload: {
  idToken: string;
  nowIso?: string;
  config?: OIDCConfig;
}): ParsedOidcToken => {
  const nowIso = payload.nowIso ?? new Date().toISOString();
  const decoded = decodeTokenPayload(payload.idToken);

  const issuer = readString(decoded, 'iss');
  if (payload.config?.issuer && issuer && normalize(payload.config.issuer) !== normalize(issuer)) {
    throw new Error('OIDC issuer mismatch.');
  }

  const audience = readString(decoded, 'aud');
  if (payload.config?.audience && audience && normalize(payload.config.audience) !== normalize(audience)) {
    throw new Error('OIDC audience mismatch.');
  }

  const email = readString(decoded, 'email');
  if (!email) {
    throw new Error('OIDC token missing email claim.');
  }

  const issuedAtSeconds = Number(decoded.iat ?? Date.parse(nowIso) / 1000);
  const expiresAtSeconds = Number(decoded.exp ?? issuedAtSeconds + 3600);
  const issuedAtIso = new Date(issuedAtSeconds * 1000).toISOString();
  const expiresAtIso = new Date(expiresAtSeconds * 1000).toISOString();

  if (Date.parse(expiresAtIso) <= Date.parse(nowIso)) {
    throw new Error('OIDC token is expired.');
  }

  return {
    identity: {
      userId: readString(decoded, 'sub') ?? email,
      email,
      displayName: readString(decoded, 'name'),
      groups: readGroups(decoded),
      providerUserId: readString(decoded, 'sub'),
    },
    issuedAtIso,
    expiresAtIso,
    issuer,
    audience,
  };
};
