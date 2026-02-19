export type SSOProviderType = 'saml' | 'oidc';

export interface SAMLConfig {
  entityId: string;
  ssoUrl: string;
  x509Certificate: string;
  audience?: string;
  defaultRole?: 'member' | 'viewer' | 'admin';
}

export interface OIDCConfig {
  issuer: string;
  clientId: string;
  clientSecret?: string;
  audience?: string;
  defaultRole?: 'member' | 'viewer' | 'admin';
}

export interface SSOProvider {
  id: string;
  organizationId: string;
  type: SSOProviderType;
  name: string;
  enabled: boolean;
  saml?: SAMLConfig;
  oidc?: OIDCConfig;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface SSOIdentity {
  userId: string;
  email: string;
  displayName?: string;
  groups: string[];
  providerUserId?: string;
}

export interface SSOSession {
  id: string;
  organizationId: string;
  providerId: string;
  identity: SSOIdentity;
  issuedAtIso: string;
  expiresAtIso: string;
  tokenType: 'saml' | 'oidc';
}
