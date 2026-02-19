import React, { useState } from 'react';
import { managedKeyVault, orgManager } from '../../enterprise';

interface KeyVaultPanelProps {
  userId: string;
}

const panelClass = 'rounded-xl border border-[#313d45] bg-[#111b21] p-4 text-sm text-[#c7d0d6]';

export const KeyVaultPanel: React.FC<KeyVaultPanelProps> = ({ userId }) => {
  const [refreshTick, setRefreshTick] = useState(0);
  const [workspaceId, setWorkspaceId] = useState('workspace-enterprise');
  const [provider, setProvider] = useState('gemini');
  const [label, setLabel] = useState('Primary Key');
  const [keyInput, setKeyInput] = useState('');
  const [status, setStatus] = useState('');

  const organizations = orgManager.listOrganizationsForUser(userId);

  const organization = organizations[0] ?? null;

  const keys = organization
    ? managedKeyVault.listKeys({ organizationId: organization.id, includeRevoked: true })
    : [];

  const refresh = () => setRefreshTick((tick) => tick + 1);

  const handleStoreKey = async () => {
    if (!organization) {
      setStatus('Create/select organization before storing keys.');
      return;
    }
    if (!keyInput.trim()) {
      setStatus('Enter a key value first.');
      return;
    }

    try {
      await managedKeyVault.storeKey({
        organizationId: organization.id,
        workspaceId: workspaceId.trim(),
        provider: provider.trim(),
        label: label.trim(),
        plaintextKey: keyInput.trim(),
        rotationDays: 90,
        graceDays: 7,
      });
    } catch {
      setStatus('Failed to store key.');
      return;
    }

    setKeyInput('');
    setStatus('Stored key in managed vault.');
    refresh();
  };

  const handleRotate = async (keyId: string) => {
    const replacement = window.prompt('Enter rotated key value');
    if (!replacement) return;
    try {
      await managedKeyVault.rotateKey({
        keyId,
        newPlaintextKey: replacement,
        rotationDays: 90,
        graceDays: 7,
      });
    } catch {
      setStatus('Failed to rotate key.');
      return;
    }
    setStatus('Key rotated.');
    refresh();
  };

  const handleRevoke = (keyId: string) => {
    const confirm = window.confirm('Revoke this key now?');
    if (!confirm) return;
    managedKeyVault.revokeKey({ keyId });
    setStatus('Key revoked.');
    refresh();
  };

  return (
    <div className="h-full overflow-y-auto bg-[#0b141a] p-4">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className={panelClass}>
          <h2 className="text-lg font-semibold text-[#e9edef]">Managed Key Vault</h2>
          <p className="mt-1 text-sm text-[#8ea1ab]">
            Workspace-scoped enterprise key vault with rotation schedules and emergency revocation.
          </p>
        </header>

        {!organization ? (
          <section className={panelClass}>
            <div className="text-xs text-[#8ea1ab]">No organization found for this user.</div>
          </section>
        ) : (
          <>
            <section className={panelClass}>
              <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Store Key</h3>
              <div className="grid gap-2 md:grid-cols-4">
                <input
                  value={workspaceId}
                  onChange={(event) => setWorkspaceId(event.target.value)}
                  placeholder="workspace id"
                  className="rounded border border-[#313d45] bg-[#0f171c] px-3 py-2 text-xs text-[#d8e1e6]"
                />
                <input
                  value={provider}
                  onChange={(event) => setProvider(event.target.value)}
                  placeholder="provider"
                  className="rounded border border-[#313d45] bg-[#0f171c] px-3 py-2 text-xs text-[#d8e1e6]"
                />
                <input
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder="label"
                  className="rounded border border-[#313d45] bg-[#0f171c] px-3 py-2 text-xs text-[#d8e1e6]"
                />
                <input
                  value={keyInput}
                  onChange={(event) => setKeyInput(event.target.value)}
                  placeholder="api key"
                  className="rounded border border-[#313d45] bg-[#0f171c] px-3 py-2 text-xs text-[#d8e1e6]"
                />
              </div>
              <button
                type="button"
                className="mt-2 rounded border border-[#4f6f84] px-3 py-2 text-xs text-[#bfd8e8] hover:bg-[#1d3140]"
                onClick={handleStoreKey}
              >
                Store
              </button>
            </section>

            <section className={panelClass}>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[#e9edef]">Key Inventory</h3>
                <button
                  type="button"
                  className="rounded border border-[#4f6f84] px-3 py-1.5 text-xs text-[#bfd8e8] hover:bg-[#1d3140]"
                  onClick={refresh}
                >
                  Refresh
                </button>
              </div>

              {keys.length === 0 ? (
                <div className="rounded border border-[#2d3942] bg-[#0d151a] p-3 text-xs text-[#8ea1ab]">
                  No keys in vault yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {keys.map((key) => (
                    <article key={key.id} className="rounded border border-[#2d3942] bg-[#0d151a] p-3 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="text-sm text-[#e9edef]">{key.label}</div>
                          <div className="text-[#8ea1ab]">
                            {key.provider} • workspace {key.workspaceId}
                          </div>
                        </div>
                        <div className="text-[#8ea1ab]">uses {key.useCount}</div>
                      </div>

                      <div className="mt-2 text-[#8ea1ab]">
                        Rotation due: {new Date(key.rotateAtIso).toLocaleDateString()} • Grace until{' '}
                        {new Date(key.gracePeriodUntilIso).toLocaleDateString()}
                      </div>
                      <div className="mt-1 text-[#70868f]">revoked: {key.revokedAtIso ? 'yes' : 'no'}</div>

                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          className="rounded border border-[#4f6f84] px-2 py-1 text-[11px] text-[#bfd8e8] hover:bg-[#1d3140]"
                          onClick={() => handleRotate(key.id)}
                        >
                          Rotate
                        </button>
                        <button
                          type="button"
                          className="rounded border border-[#7b3b3b] px-2 py-1 text-[11px] text-[#f2c0c0] hover:bg-[#2d1515]"
                          onClick={() => handleRevoke(key.id)}
                        >
                          Emergency Revoke
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {status ? (
          <div className="rounded border border-[#2d3942] bg-[#0d151a] px-3 py-2 text-xs text-[#aebec8]">{status}</div>
        ) : null}
      </div>
    </div>
  );
};

export default KeyVaultPanel;
