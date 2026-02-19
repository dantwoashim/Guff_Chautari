import { describe, expect, it } from 'vitest';
import { ManagedKeyVault } from '../keyVault';

describe('managed key vault', () => {
  it('stores encrypted key at rest and decrypts on retrieval', async () => {
    const vault = new ManagedKeyVault();

    const stored = await vault.storeKey({
      organizationId: 'org-vault',
      workspaceId: 'ws-vault',
      provider: 'gemini',
      label: 'Primary Gemini Key',
      plaintextKey: 'secret-api-key-123',
      nowIso: '2026-09-07T09:00:00.000Z',
      rotationDays: 60,
      graceDays: 5,
    });

    expect(stored.encryptedValue).not.toContain('secret-api-key-123');

    const plaintext = await vault.getDecryptedKey({
      organizationId: 'org-vault',
      workspaceId: 'ws-vault',
      keyId: stored.id,
      nowIso: '2026-09-07T09:01:00.000Z',
    });

    expect(plaintext).toBe('secret-api-key-123');
    expect(vault.listKeys({ organizationId: 'org-vault' })[0].useCount).toBe(1);
  });
});
