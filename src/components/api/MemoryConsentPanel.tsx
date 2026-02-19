import React, { useMemo, useState } from 'react';
import {
  memoryConsentManager,
  type MemoryConsentRecord,
} from '../../api/consentManager';
import { memoryProtocol } from '../../api/memoryProtocol';

interface MemoryConsentPanelProps {
  userId: string;
  workspaceId: string;
}

const formatDate = (iso?: string): string => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
};

export const MemoryConsentPanel: React.FC<MemoryConsentPanelProps> = ({
  userId,
  workspaceId,
}) => {
  const [tick, setTick] = useState(0);

  const consents = useMemo(() => {
    void tick;
    return memoryConsentManager.listForWorkspace({
      userId,
      workspaceId,
      includeRevoked: true,
    });
  }, [tick, userId, workspaceId]);

  const namespaceStats = useMemo(() => {
    void tick;
    return memoryProtocol.listNamespaceStats({
      userId,
      workspaceId,
    });
  }, [tick, userId, workspaceId]);

  const statsByNamespace = useMemo(() => {
    return new Map(namespaceStats.map((entry) => [entry.namespace, entry]));
  }, [namespaceStats]);

  const revokeNamespace = (record: MemoryConsentRecord, namespace: string) => {
    memoryConsentManager.revoke({
      userId,
      workspaceId,
      appId: record.appId,
      namespace,
      revokedByUserId: userId,
    });
    setTick((value) => value + 1);
  };

  const revokeApp = (record: MemoryConsentRecord) => {
    memoryConsentManager.revoke({
      userId,
      workspaceId,
      appId: record.appId,
      revokedByUserId: userId,
    });
    setTick((value) => value + 1);
  };

  return (
    <div className="h-full overflow-y-auto bg-[#0b141a] p-4">
      <div className="mx-auto max-w-5xl space-y-4">
        <section className="rounded-xl border border-[#313d45] bg-[#111b21] p-4">
          <h2 className="text-lg font-semibold text-[#e9edef]">Memory Consent Dashboard</h2>
          <p className="mt-1 text-sm text-[#9fb0b8]">
            Review third-party app access to memory namespaces and revoke access instantly.
          </p>
        </section>

        {consents.length === 0 ? (
          <section className="rounded-xl border border-[#313d45] bg-[#111b21] p-4 text-sm text-[#aebac1]">
            No app memory consents granted yet.
          </section>
        ) : (
          <section className="space-y-3">
            {consents.map((record) => (
              <article
                key={record.id}
                className="rounded-xl border border-[#313d45] bg-[#111b21] p-4"
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-[#e9edef]">App: {record.appId}</h3>
                    <p className="text-xs text-[#8fa3af]">
                      Status: {record.status} • Granted: {formatDate(record.grantedAtIso)}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="rounded border border-[#6a2f37] px-3 py-1.5 text-xs text-[#f3b7bf] hover:bg-[#3a1a1f]"
                    onClick={() => revokeApp(record)}
                  >
                    Revoke App Access
                  </button>
                </div>

                <div className="mb-3 flex flex-wrap gap-2 text-[11px] text-[#b8c7cf]">
                  <span className="rounded-full bg-[#202c33] px-2 py-1">
                    Read: {record.permissions.read ? 'yes' : 'no'}
                  </span>
                  <span className="rounded-full bg-[#202c33] px-2 py-1">
                    Write: {record.permissions.write ? 'yes' : 'no'}
                  </span>
                  <span className="rounded-full bg-[#202c33] px-2 py-1">
                    Consolidate: {record.permissions.consolidate ? 'yes' : 'no'}
                  </span>
                  <span className="rounded-full bg-[#202c33] px-2 py-1">
                    Read count: {record.usage.readCount}
                  </span>
                  <span className="rounded-full bg-[#202c33] px-2 py-1">
                    Write count: {record.usage.writeCount}
                  </span>
                </div>

                <div className="space-y-2">
                  {record.namespaces.map((namespace) => {
                    const stats = statsByNamespace.get(namespace);
                    return (
                      <div
                        key={`${record.id}-${namespace}`}
                        className="flex flex-wrap items-center justify-between gap-3 rounded border border-[#27343d] bg-[#0f171d] p-3"
                      >
                        <div>
                          <p className="font-mono text-xs text-[#d5e1e8]">{namespace}</p>
                          <p className="text-xs text-[#8fa3af]">
                            Memories: {stats?.memoryCount ?? 0} • Last write: {formatDate(stats?.lastWriteAtIso)}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="rounded border border-[#2d5568] px-2.5 py-1 text-xs text-[#a8d8eb] hover:bg-[#123143]"
                          onClick={() => revokeNamespace(record, namespace)}
                        >
                          Revoke Namespace
                        </button>
                      </div>
                    );
                  })}
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    </div>
  );
};
