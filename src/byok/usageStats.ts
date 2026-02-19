export interface GeminiUsageStats {
  requestsLastMinute: number;
  requestsLastHour: number;
  requestsLast24Hours: number;
  estimatedMonthlyRequests: number;
  rateLimitProximityPct: number;
  quotaUsageEstimatePct: number;
}

const STORAGE_KEY = 'ashim.byok.gemini.request_timestamps.v1';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const ONE_MINUTE_MS = 60 * 1000;
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;
const ESTIMATED_SOFT_MONTHLY_CAP = 50000;
const ESTIMATED_MINUTE_SOFT_CAP = 60;

const readTimestamps = (): number[] => {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as number[];
    return Array.isArray(parsed) ? parsed.filter((value) => typeof value === 'number') : [];
  } catch {
    return [];
  }
};

const writeTimestamps = (timestamps: number[]): void => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(timestamps));
};

const prune = (timestamps: number[], now: number): number[] => {
  return timestamps.filter((timestamp) => now - timestamp <= THIRTY_DAYS_MS);
};

export const recordGeminiRequest = (): void => {
  const now = Date.now();
  const pruned = prune(readTimestamps(), now);
  pruned.push(now);
  writeTimestamps(pruned);
};

export const getGeminiUsageStats = (): GeminiUsageStats => {
  const now = Date.now();
  const timestamps = prune(readTimestamps(), now);
  writeTimestamps(timestamps);

  const requestsLastMinute = timestamps.filter((value) => now - value <= ONE_MINUTE_MS).length;
  const requestsLastHour = timestamps.filter((value) => now - value <= ONE_HOUR_MS).length;
  const requestsLast24Hours = timestamps.filter((value) => now - value <= ONE_DAY_MS).length;

  const daysCovered = Math.max(1, Math.min(30, timestamps.length > 0 ? THIRTY_DAYS_MS / ONE_DAY_MS : 1));
  const dailyAverage = requestsLast24Hours || Math.round(timestamps.length / daysCovered);
  const estimatedMonthlyRequests = dailyAverage * 30;

  const rateLimitProximityPct = Math.min(
    100,
    Math.round((requestsLastMinute / ESTIMATED_MINUTE_SOFT_CAP) * 100)
  );
  const quotaUsageEstimatePct = Math.min(
    100,
    Math.round((estimatedMonthlyRequests / ESTIMATED_SOFT_MONTHLY_CAP) * 100)
  );

  return {
    requestsLastMinute,
    requestsLastHour,
    requestsLast24Hours,
    estimatedMonthlyRequests,
    rateLimitProximityPct,
    quotaUsageEstimatePct,
  };
};
