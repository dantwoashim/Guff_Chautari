import React, { useMemo, useState } from 'react';
import type { CheckpointProposedAction, WorkflowCheckpointRequest } from '../../workflows';

interface CheckpointReviewPanelProps {
  checkpoints: WorkflowCheckpointRequest[];
  onApprove: (payload: { requestId: string }) => Promise<void> | void;
  onReject: (payload: { requestId: string; reason: string }) => Promise<void> | void;
  onEdit: (payload: { requestId: string; editedAction: Partial<CheckpointProposedAction> }) => Promise<void> | void;
}

const defaultEditedAction = (request: WorkflowCheckpointRequest): Required<CheckpointProposedAction> => {
  return {
    title: request.proposedAction.title,
    description: request.proposedAction.description,
    actionId: request.proposedAction.actionId,
    inputTemplate: request.proposedAction.inputTemplate ?? '',
  };
};

export const CheckpointReviewPanel: React.FC<CheckpointReviewPanelProps> = ({
  checkpoints,
  onApprove,
  onReject,
  onEdit,
}) => {
  const [reasonsById, setReasonsById] = useState<Record<string, string>>({});
  const [draftActionsById, setDraftActionsById] = useState<
    Record<string, Required<CheckpointProposedAction>>
  >({});

  const sortedCheckpoints = useMemo(() => {
    return [...checkpoints].sort(
      (left, right) => Date.parse(right.createdAtIso) - Date.parse(left.createdAtIso)
    );
  }, [checkpoints]);

  const resolveDraftAction = (request: WorkflowCheckpointRequest): Required<CheckpointProposedAction> => {
    return draftActionsById[request.id] ?? defaultEditedAction(request);
  };

  return (
    <section className="rounded-xl border border-[#313d45] bg-[#111b21] p-4 text-sm text-[#c7d0d6]">
      <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Checkpoint Review</h3>
      <p className="text-xs text-[#8ea1ab]">
        Review paused workflows, approve next actions, reject with reason, or edit proposed actions before resuming.
      </p>

      <div className="mt-3 space-y-3">
        {sortedCheckpoints.length === 0 ? (
          <div className="rounded border border-[#2d3942] bg-[#0f171c] p-3 text-xs text-[#8ea1ab]">
            No pending checkpoints.
          </div>
        ) : (
          sortedCheckpoints.map((request) => {
            const draftAction = resolveDraftAction(request);
            const reason = reasonsById[request.id] ?? '';

            return (
              <div key={request.id} className="rounded border border-[#27343d] bg-[#0f171c] p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[#e9edef]">
                    Checkpoint {request.checkpointStepId} ({request.riskLevel} risk)
                  </div>
                  <div className="text-[11px] text-[#7f929c]">
                    {new Date(request.createdAtIso).toLocaleString()}
                  </div>
                </div>

                <div className="mt-1 text-[#9fb0ba]">{request.riskSummary}</div>

                <div className="mt-2 rounded border border-[#2a3a44] bg-[#111b21] p-2">
                  <div className="text-[11px] uppercase tracking-wide text-[#8ea1ab]">Proposed Action</div>
                  <div className="mt-1 text-[#d7e4ea]">{request.proposedAction.title}</div>
                  <div className="text-[#9fb0ba]">{request.proposedAction.description}</div>
                  <div className="text-[11px] text-[#7f929c]">{request.proposedAction.actionId}</div>
                </div>

                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <input
                    value={draftAction.title}
                    onChange={(event) =>
                      setDraftActionsById((current) => ({
                        ...current,
                        [request.id]: {
                          ...resolveDraftAction(request),
                          title: event.target.value,
                        },
                      }))
                    }
                    placeholder="Edited title"
                    className="rounded border border-[#313d45] bg-[#111b21] px-2 py-1 text-xs text-[#dfe7eb]"
                  />
                  <input
                    value={draftAction.actionId}
                    onChange={(event) =>
                      setDraftActionsById((current) => ({
                        ...current,
                        [request.id]: {
                          ...resolveDraftAction(request),
                          actionId: event.target.value,
                        },
                      }))
                    }
                    placeholder="Edited actionId"
                    className="rounded border border-[#313d45] bg-[#111b21] px-2 py-1 text-xs text-[#dfe7eb]"
                  />
                  <textarea
                    value={draftAction.description}
                    onChange={(event) =>
                      setDraftActionsById((current) => ({
                        ...current,
                        [request.id]: {
                          ...resolveDraftAction(request),
                          description: event.target.value,
                        },
                      }))
                    }
                    placeholder="Edited description"
                    className="md:col-span-2 h-16 rounded border border-[#313d45] bg-[#111b21] px-2 py-1 text-xs text-[#dfe7eb]"
                  />
                  <textarea
                    value={draftAction.inputTemplate}
                    onChange={(event) =>
                      setDraftActionsById((current) => ({
                        ...current,
                        [request.id]: {
                          ...resolveDraftAction(request),
                          inputTemplate: event.target.value,
                        },
                      }))
                    }
                    placeholder="Edited inputTemplate (optional)"
                    className="md:col-span-2 h-14 rounded border border-[#313d45] bg-[#111b21] px-2 py-1 text-xs text-[#dfe7eb]"
                  />
                </div>

                <div className="mt-2">
                  <textarea
                    value={reason}
                    onChange={(event) =>
                      setReasonsById((current) => ({
                        ...current,
                        [request.id]: event.target.value,
                      }))
                    }
                    placeholder="Rejection reason (required for reject)"
                    className="h-14 w-full rounded border border-[#313d45] bg-[#111b21] px-2 py-1 text-xs text-[#dfe7eb]"
                  />
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded border border-[#3a6d52] px-2 py-1 text-[11px] text-[#a8e5c4]"
                    onClick={() => {
                      void onApprove({ requestId: request.id });
                    }}
                  >
                    Approve + Resume
                  </button>
                  <button
                    type="button"
                    className="rounded border border-[#6b5a2a] px-2 py-1 text-[11px] text-[#f3e2b3]"
                    onClick={() => {
                      void onEdit({
                        requestId: request.id,
                        editedAction: {
                          title: draftAction.title,
                          description: draftAction.description,
                          actionId: draftAction.actionId,
                          inputTemplate: draftAction.inputTemplate || undefined,
                        },
                      });
                    }}
                  >
                    Edit Action + Resume
                  </button>
                  <button
                    type="button"
                    className="rounded border border-[#7b3b3b] px-2 py-1 text-[11px] text-[#f0bbbb]"
                    onClick={() => {
                      void onReject({
                        requestId: request.id,
                        reason: reason.trim() || 'Rejected by reviewer.',
                      });
                    }}
                  >
                    Reject
                  </button>
                </div>

                <div className="mt-2 text-[11px] text-[#7f929c]">
                  Previous results: {request.previousStepResults.map((result) => result.stepId).join(', ') || 'n/a'}
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
};

export default CheckpointReviewPanel;
