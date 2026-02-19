import { describe, expect, it } from 'vitest';
import { OrgManager } from '../orgManager';
import { SSOManager } from '../sso/ssoManager';

describe('sso manager', () => {
  it('authenticates mock SAML assertion and creates session', () => {
    const manager = new OrgManager();
    const created = manager.createOrganization({
      ownerUserId: 'owner-sso',
      name: 'Org SSO',
      nowIso: '2026-09-02T09:00:00.000Z',
    });

    const sso = new SSOManager(manager);
    const provider = sso.configureProvider({
      organizationId: created.organization.id,
      actorUserId: 'owner-sso',
      type: 'saml',
      name: 'Okta',
      saml: {
        entityId: 'urn:ashim:test',
        ssoUrl: 'https://okta.example/sso',
        x509Certificate: 'cert',
        audience: 'ashim-enterprise',
      },
      nowIso: '2026-09-02T09:10:00.000Z',
    });

    const assertionPayload = {
      email: 'member@example.com',
      userId: 'member-1',
      groups: ['engineering', 'founders'],
      issuedAtIso: '2026-09-02T09:11:00.000Z',
      expiresAtIso: '2026-09-02T10:11:00.000Z',
      audience: 'ashim-enterprise',
    };

    const session = sso.authenticateWithSaml({
      organizationId: created.organization.id,
      providerId: provider.id,
      assertion: JSON.stringify(assertionPayload),
      nowIso: '2026-09-02T09:20:00.000Z',
    });

    expect(session.identity.email).toBe('member@example.com');
    expect(session.identity.groups).toContain('engineering');
    expect(session.providerId).toBe(provider.id);
  });
});
