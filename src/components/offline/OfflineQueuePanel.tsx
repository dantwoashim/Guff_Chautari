import React, { useMemo, useState } from 'react';
import { i18nRuntime } from '../../i18n';
import {
  listQueuedMessages,
  removeQueuedMessage,
  setQueuedMessagePriority,
  type QueuedMessagePriority,
} from '../../offline/messageQueue';
import { useOfflineQueueStatus } from '../../offline/useOfflineQueueStatus';
import {
  generateOfflineTemplateResponse,
  listOfflineWorkflowStatus,
  searchOfflineKnowledge,
} from '../../offline/degradedMode';

interface OfflineQueuePanelProps {
  userId: string;
  activeSessionId?: string | null;
}

const PRIORITIES: QueuedMessagePriority[] = ['high', 'normal', 'low'];

export const OfflineQueuePanel: React.FC<OfflineQueuePanelProps> = ({ userId, activeSessionId }) => {
  const [refreshTick, setRefreshTick] = useState(0);
  const [knowledgeQuery, setKnowledgeQuery] = useState('weekly review');
  const { isOnline, queuedCount } = useOfflineQueueStatus();

  void refreshTick;
  const queue = listQueuedMessages(activeSessionId ?? undefined);

  const knowledgeHits = useMemo(() => {
    return searchOfflineKnowledge({
      userId,
      query: knowledgeQuery,
      topK: 4,
    });
  }, [knowledgeQuery, userId]);

  const workflowStatus = listOfflineWorkflowStatus({
    userId,
    limit: 6,
  });

  const fallbackPreview = useMemo(() => {
    const sample = queue[0]?.message.text || 'Help me plan my next week.';
    return generateOfflineTemplateResponse({
      personaName: 'Offline Companion',
      personaTone: 'balanced',
      userMessage: sample,
      queuedCount,
    });
  }, [queue, queuedCount]);

  const statusColor = isOnline
    ? 'border-[#40614f] bg-[#11271c] text-[#b8e8c7]'
    : 'border-[#6b2f31] bg-[#2a1517] text-[#f5c3c7]';

  return (
    <div className="h-full overflow-y-auto bg-[#0b141a] p-4">
      <div className="mx-auto max-w-6xl space-y-4">
        <section className="rounded-xl border border-[#313d45] bg-[#111b21] p-4">
          <h2 className="text-lg font-semibold text-[#e9edef]">{i18nRuntime.t('offlineQueue.title')}</h2>
          <p className="mt-1 text-sm text-[#9fb0b8]">{i18nRuntime.t('offlineQueue.description')}</p>
        </section>

        <section className={`rounded-xl border px-4 py-3 text-sm ${statusColor}`}>
          <span className="font-semibold">
            {i18nRuntime.t(
              isOnline ? 'offlineQueue.status.online' : 'offlineQueue.status.offline'
            )}
          </span>{' '}
          • {queuedCount} queued turn(s)
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-xl border border-[#313d45] bg-[#111b21] p-4">
            <h3 className="mb-3 text-sm font-semibold text-[#e9edef]">Queue Management</h3>
            {queue.length === 0 ? (
              <div className="rounded border border-[#2b3a43] bg-[#0f171d] p-3 text-sm text-[#8ea1ab]">
                {i18nRuntime.t('offlineQueue.empty')}
              </div>
            ) : (
              <ul className="space-y-2">
                {queue.map((record) => (
                  <li key={record.queueId} className="rounded border border-[#27343d] bg-[#0f171d] p-3">
                    <p className="text-sm text-[#d7e1e7]">{record.message.text || '[attachment-only turn]'}</p>
                    <p className="mt-1 text-[11px] text-[#8fa3af]">
                      {new Date(record.enqueuedAtIso).toLocaleString()} • attempts {record.attempts}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {PRIORITIES.map((priority) => (
                        <button
                          key={`${record.queueId}-${priority}`}
                          type="button"
                          className={`rounded border px-2 py-1 text-[11px] ${
                            (record.priority ?? 'normal') === priority
                              ? 'border-[#00a884] bg-[#123b34] text-[#dffaf3]'
                              : 'border-[#3b4d57] text-[#b8cad3] hover:bg-[#1b2831]'
                          }`}
                          onClick={() => {
                            setQueuedMessagePriority(record.queueId, priority);
                            setRefreshTick((tick) => tick + 1);
                          }}
                        >
                          {i18nRuntime.t(`offlineQueue.priority.${priority}`)}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="rounded border border-[#73404a] px-2 py-1 text-[11px] text-[#f0c2cc] hover:bg-[#40202a]"
                        onClick={() => {
                          removeQueuedMessage(record.queueId);
                          setRefreshTick((tick) => tick + 1);
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </article>

          <article className="rounded-xl border border-[#313d45] bg-[#111b21] p-4">
            <h3 className="mb-3 text-sm font-semibold text-[#e9edef]">Offline Degraded Preview</h3>
            <div className="rounded border border-[#2b3a43] bg-[#0f171d] p-3 text-sm text-[#d7e1e7]">
              {fallbackPreview}
            </div>
            <div className="mt-3">
              <label className="text-xs text-[#8fa3af]">Local knowledge search</label>
              <input
                value={knowledgeQuery}
                onChange={(event) => setKnowledgeQuery(event.target.value)}
                className="mt-1 w-full rounded border border-[#2b3a43] bg-[#0f171d] px-3 py-2 text-sm text-[#dfe7eb]"
              />
              <ul className="mt-2 space-y-2">
                {knowledgeHits.map((hit) => (
                  <li key={`${hit.sourceId}-${hit.snippet}`} className="rounded border border-[#24323a] bg-[#0d151a] p-2 text-xs text-[#b9c9d0]">
                    <p className="text-[#d9e7ed]">{hit.sourceTitle}</p>
                    <p className="mt-1 line-clamp-2">{hit.snippet}</p>
                  </li>
                ))}
              </ul>
            </div>
          </article>
        </section>

        <section className="rounded-xl border border-[#313d45] bg-[#111b21] p-4">
          <h3 className="mb-3 text-sm font-semibold text-[#e9edef]">Last Known Workflow State</h3>
          <div className="grid gap-2 md:grid-cols-2">
            {workflowStatus.length === 0 ? (
              <div className="rounded border border-[#2b3a43] bg-[#0f171d] p-3 text-sm text-[#8ea1ab]">
                No workflow snapshots available.
              </div>
            ) : (
              workflowStatus.map((workflow) => (
                <article key={workflow.workflowId} className="rounded border border-[#27343d] bg-[#0f171d] p-3 text-sm">
                  <p className="text-[#d7e1e7]">{workflow.name}</p>
                  <p className="mt-1 text-xs text-[#8fa3af]">
                    status: {workflow.status} • {new Date(workflow.updatedAtIso).toLocaleString()}
                  </p>
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
