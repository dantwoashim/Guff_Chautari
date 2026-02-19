import React from 'react';
import { getGeminiUsageStats } from '../../byok/usageStats';
import { KeyHealthStatus } from '../../byok/types';

interface BYOKHealthDashboardProps {
  status: KeyHealthStatus;
  fingerprint: string | null;
  lastCheck: number | null;
  onRotate: () => void;
}

const statusTone: Record<KeyHealthStatus, string> = {
  healthy: 'text-emerald-300',
  warning: 'text-amber-200',
  invalid: 'text-red-200',
  missing: 'text-slate-200',
  unknown: 'text-slate-200',
};

const BYOKHealthDashboard: React.FC<BYOKHealthDashboardProps> = ({
  status,
  fingerprint,
  lastCheck,
  onRotate,
}) => {
  const stats = getGeminiUsageStats();

  return (
    <div className="mx-4 mt-3 rounded-xl border border-white/10 bg-[#0f171c] px-4 py-3 text-white">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-[#8ea4b1]">BYOK Health Dashboard</p>
          <p className={`text-sm font-semibold ${statusTone[status]}`}>
            Gemini key status: {status}
          </p>
          <p className="text-xs text-[#8ea4b1]">
            Fingerprint: {fingerprint ?? 'n/a'} | Last check:{' '}
            {lastCheck ? new Date(lastCheck).toLocaleString() : 'n/a'}
          </p>
        </div>
        <button
          onClick={onRotate}
          className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
        >
          Rotate Key
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
        <div className="rounded-lg border border-white/10 bg-white/5 p-2">
          <p className="text-[#8ea4b1]">Requests / min</p>
          <p className="text-sm font-semibold">{stats.requestsLastMinute}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-2">
          <p className="text-[#8ea4b1]">Requests / hour</p>
          <p className="text-sm font-semibold">{stats.requestsLastHour}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-2">
          <p className="text-[#8ea4b1]">Rate-limit proximity</p>
          <p className="text-sm font-semibold">{stats.rateLimitProximityPct}%</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-2">
          <p className="text-[#8ea4b1]">Quota usage estimate</p>
          <p className="text-sm font-semibold">{stats.quotaUsageEstimatePct}%</p>
        </div>
      </div>
    </div>
  );
};

export default BYOKHealthDashboard;
