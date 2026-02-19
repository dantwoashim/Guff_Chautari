import type { OrgManager } from '../orgManager';
import { orgManager } from '../orgManager';
import { parseOidcIdToken } from './oidcAdapter';
import { parseSamlAssertion } from './samlAdapter';
import type {
  OIDCConfig,
  SAMLConfig,
  SSOProvider,
  SSOSession,
} from './types';

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

const parseMs = (iso: string): number => {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? 0 : parsed;
};

export class SSOManager {
  private providersByOrg = new Map<string, SSOProvider[]>();
  private sessionsById = new Map<string, SSOSession>();

  constructor(private readonly manager: Pick<OrgManager, 'isOrgAdmin'> = orgManager) {}

  configureProvider(payload: {
    organizationId: string;
    actorUserId?: string;
    type: 'saml' | 'oidc';
    name: string;
    enabled?: boolean;
    saml?: SAMLConfig;
    oidc?: OIDCConfig;
    nowIso?: string;
  }): SSOProvider {
    const nowIso = payload.nowIso ?? new Date().toISOString();
    if (payload.actorUserId && !this.manager.isOrgAdmin(payload.organizationId, payload.actorUserId)) {
      throw new Error('Only org admins can configure SSO providers.');
    }

    if (payload.type === 'saml' && !payload.saml) {
      throw new Error('SAML config is required for SAML provider.');
    }
    if (payload.type === 'oidc' && !payload.oidc) {
      throw new Error('OIDC config is required for OIDC provider.');
    }

    const providers = this.providersByOrg.get(payload.organizationId) ?? [];
    const existing = providers.find((provider) => provider.type === payload.type && provider.name === payload.name);

    const provider: SSOProvider = {
      id: existing?.id ?? makeId('sso-provider'),
      organizationId: payload.organizationId,
      type: payload.type,
      name: payload.name,
      enabled: payload.enabled ?? true,
      saml: payload.type === 'saml' ? payload.saml : undefined,
      oidc: payload.type === 'oidc' ? payload.oidc : undefined,
      createdAtIso: existing?.createdAtIso ?? nowIso,
      updatedAtIso: nowIso,
    };

    this.providersByOrg.set(
      payload.organizationId,
      existing
        ? providers.map((entry) => (entry.id === existing.id ? provider : entry))
        : [provider, ...providers]
    );

    return provider;
  }

  listProviders(payload: { organizationId: string; actorUserId?: string }): SSOProvider[] {
    if (payload.actorUserId && !this.manager.isOrgAdmin(payload.organizationId, payload.actorUserId)) {
      throw new Error('Only org admins can list SSO providers.');
    }

    return [...(this.providersByOrg.get(payload.organizationId) ?? [])].sort(
      (left, right) => parseMs(right.updatedAtIso) - parseMs(left.updatedAtIso)
    );
  }

  authenticateWithSaml(payload: {
    organizationId: string;
    assertion: string;
    providerId?: string;
    nowIso?: string;
  }): SSOSession {
    const nowIso = payload.nowIso ?? new Date().toISOString();
    const provider = this.resolveProvider(payload.organizationId, 'saml', payload.providerId);
    if (!provider.saml) {
      throw new Error(`Provider ${provider.id} is missing SAML config.`);
    }

    const parsed = parseSamlAssertion({
      assertion: payload.assertion,
      nowIso,
      config: provider.saml,
    });

    return this.createSession({
      organizationId: payload.organizationId,
      providerId: provider.id,
      issuedAtIso: parsed.issuedAtIso,
      expiresAtIso: parsed.expiresAtIso,
      identity: parsed.identity,
      tokenType: 'saml',
    });
  }

  authenticateWithOidc(payload: {
    organizationId: string;
    idToken: string;
    providerId?: string;
    nowIso?: string;
  }): SSOSession {
    const nowIso = payload.nowIso ?? new Date().toISOString();
    const provider = this.resolveProvider(payload.organizationId, 'oidc', payload.providerId);
    if (!provider.oidc) {
      throw new Error(`Provider ${provider.id} is missing OIDC config.`);
    }

    const parsed = parseOidcIdToken({
      idToken: payload.idToken,
      nowIso,
      config: provider.oidc,
    });

    return this.createSession({
      organizationId: payload.organizationId,
      providerId: provider.id,
      issuedAtIso: parsed.issuedAtIso,
      expiresAtIso: parsed.expiresAtIso,
      identity: parsed.identity,
      tokenType: 'oidc',
    });
  }

  getSession(sessionId: string): SSOSession | null {
    return this.sessionsById.get(sessionId) ?? null;
  }

  listSessions(payload: { organizationId: string; limit?: number }): SSOSession[] {
    const limit = Math.max(1, payload.limit ?? 200);
    return [...this.sessionsById.values()]
      .filter((session) => session.organizationId === payload.organizationId)
      .sort((left, right) => parseMs(right.issuedAtIso) - parseMs(left.issuedAtIso))
      .slice(0, limit);
  }

  private createSession(payload: Omit<SSOSession, 'id'>): SSOSession {
    const session: SSOSession = {
      id: makeId('sso-session'),
      ...payload,
    };

    this.sessionsById.set(session.id, session);
    return session;
  }

  private resolveProvider(
    organizationId: string,
    type: SSOProvider['type'],
    providerId?: string
  ): SSOProvider {
    const providers = (this.providersByOrg.get(organizationId) ?? []).filter(
      (provider) => provider.type === type && provider.enabled
    );

    if (providers.length === 0) {
      throw new Error(`No enabled ${type.toUpperCase()} provider configured for organization ${organizationId}.`);
    }

    if (providerId) {
      const matched = providers.find((provider) => provider.id === providerId);
      if (!matched) {
        throw new Error(`SSO provider ${providerId} not found for organization ${organizationId}.`);
      }
      return matched;
    }

    return providers[0];
  }
}

export const ssoManager = new SSOManager();
