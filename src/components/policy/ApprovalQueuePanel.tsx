import type { ApprovalRequest } from '../../policy';

interface ApprovalQueuePanelProps {
  approvals: ReadonlyArray<ApprovalRequest>;
  onApprove: (requestId: string) => void;
  onReject: (requestId: string) => void;
}

const statusTone: Record<ApprovalRequest['status'], string> = {
  pending: 'text-amber-300',
  approved: 'text-emerald-300',
  rejected: 'text-rose-300',
  expired: 'text-zinc-400',
};

export const ApprovalQueuePanel = ({
  approvals,
  onApprove,
  onReject,
}: ApprovalQueuePanelProps) => {
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-100">Approval Queue</h3>
        <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
          {approvals.length} item{approvals.length === 1 ? '' : 's'}
        </span>
      </header>

      <ul className="space-y-3">
        {approvals.length === 0 ? (
          <li className="rounded-md border border-zinc-800 px-3 py-2 text-xs text-zinc-400">
            No pending approvals.
          </li>
        ) : (
          approvals.map((approval) => (
            <li
              key={approval.id}
              className="rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2"
            >
              <div className="mb-1 flex items-center justify-between gap-3">
                <code className="text-xs text-zinc-200">{approval.action_id}</code>
                <span className={`text-xs font-medium ${statusTone[approval.status]}`}>
                  {approval.status}
                </span>
              </div>

              <p className="mb-1 text-xs text-zinc-400">{approval.reason}</p>
              <p className="text-[11px] text-zinc-500">
                requested by {approval.actor_user_id} · expires {approval.expires_at}
              </p>

              {approval.status === 'pending' ? (
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => onApprove(approval.id)}
                    className="rounded border border-emerald-700 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-900/30"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => onReject(approval.id)}
                    className="rounded border border-rose-700 px-2 py-1 text-xs text-rose-300 hover:bg-rose-900/30"
                  >
                    Reject
                  </button>
                </div>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </section>
  );
};

