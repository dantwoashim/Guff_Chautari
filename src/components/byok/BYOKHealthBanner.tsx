import React from 'react';
import { KeyHealthStatus } from '../../byok/types';

interface BYOKHealthBannerProps {
  status: KeyHealthStatus;
  fingerprint: string | null;
  lastCheck: number | null;
  errorMessage: string | null;
  onRevalidate: () => Promise<void>;
  onRevoke: () => void;
}

const statusLabel: Record<KeyHealthStatus, string> = {
  healthy: 'Healthy',
  warning: 'Warning',
  invalid: 'Invalid',
  missing: 'Missing',
  unknown: 'Unknown',
};

const statusClass: Record<KeyHealthStatus, string> = {
  healthy: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-100',
  invalid: 'border-red-500/30 bg-red-500/10 text-red-200',
  missing: 'border-slate-500/30 bg-slate-500/10 text-slate-200',
  unknown: 'border-slate-500/30 bg-slate-500/10 text-slate-200',
};

const BYOKHealthBanner: React.FC<BYOKHealthBannerProps> = ({
  status,
  fingerprint,
  lastCheck,
  errorMessage,
  onRevalidate,
  onRevoke,
}) => {
  if (status === 'missing') return null;

  return (
    <div className={`mx-4 mt-3 rounded-xl border px-4 py-3 text-sm ${statusClass[status]}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="font-semibold">BYOK: Gemini key {statusLabel[status]}</p>
          <p className="text-xs opacity-90">
            Fingerprint: {fingerprint ?? 'n/a'} | Last check:{' '}
            {lastCheck ? new Date(lastCheck).toLocaleTimeString() : 'n/a'}
          </p>
          {errorMessage && <p className="text-xs opacity-90">{errorMessage}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void onRevalidate()}
            className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/90"
          >
            Revalidate
          </button>
          <button
            onClick={onRevoke}
            className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/90"
          >
            Revoke
          </button>
        </div>
      </div>
    </div>
  );
};

export default BYOKHealthBanner;
