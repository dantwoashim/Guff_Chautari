export interface ShadowTraceStage {
  id: string;
  summary: string;
  detail?: string;
}

export interface ShadowTraceRecord {
  id: string;
  traceId: string;
  sessionId: string;
  userMessageId?: string;
  assistantMessageIds: string[];
  createdAtIso: string;
  model: string;
  provider: string;
  promptPreview: string;
  emotionalSummary: string;
  memoryIds: string[];
  stages: ShadowTraceStage[];
}

const SHADOW_ENABLED_KEY = 'ashim.shadow.enabled.v1';
const SHADOW_TRACE_KEY = 'ashim.shadow.traces.v1';
const SHADOW_TRACE_LIMIT = 240;

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

const canUseStorage = (): boolean =>
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const readTraces = (): ShadowTraceRecord[] => {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(SHADOW_TRACE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ShadowTraceRecord[]) : [];
  } catch {
    return [];
  }
};

const writeTraces = (traces: ReadonlyArray<ShadowTraceRecord>): void => {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(
      SHADOW_TRACE_KEY,
      JSON.stringify([...traces].slice(-SHADOW_TRACE_LIMIT))
    );
  } catch {
    // ignore storage failures
  }
};

export const isShadowModeEnabled = (): boolean => {
  if (!canUseStorage()) return false;
  return window.localStorage.getItem(SHADOW_ENABLED_KEY) === '1';
};

export const setShadowModeEnabled = (enabled: boolean): void => {
  if (!canUseStorage()) return;
  window.localStorage.setItem(SHADOW_ENABLED_KEY, enabled ? '1' : '0');
};

export const recordShadowTrace = (payload: Omit<ShadowTraceRecord, 'id'>): ShadowTraceRecord => {
  const record: ShadowTraceRecord = {
    ...payload,
    id: makeId('shadow'),
    assistantMessageIds: [...payload.assistantMessageIds],
    memoryIds: [...payload.memoryIds],
    stages: payload.stages.map((stage) => ({ ...stage })),
  };
  const traces = readTraces();
  writeTraces([...traces, record]);
  return record;
};

export const linkTraceToAssistantMessage = (payload: {
  traceId: string;
  assistantMessageId: string;
}): ShadowTraceRecord | null => {
  const traces = readTraces();
  let updated: ShadowTraceRecord | null = null;
  const next = traces.map((trace) => {
    if (trace.traceId !== payload.traceId) return trace;
    const assistantMessageIds = trace.assistantMessageIds.includes(payload.assistantMessageId)
      ? trace.assistantMessageIds
      : [...trace.assistantMessageIds, payload.assistantMessageId];
    updated = {
      ...trace,
      assistantMessageIds,
    };
    return updated;
  });

  if (!updated) return null;
  writeTraces(next);
  return updated;
};

export const getShadowTraceByAssistantMessage = (
  assistantMessageId: string
): ShadowTraceRecord | null => {
  const traces = readTraces();
  return traces.find((trace) => trace.assistantMessageIds.includes(assistantMessageId)) ?? null;
};

export const listShadowTracesForSession = (sessionId: string): ShadowTraceRecord[] => {
  return readTraces()
    .filter((trace) => trace.sessionId === sessionId)
    .sort((left, right) => Date.parse(right.createdAtIso) - Date.parse(left.createdAtIso));
};

export const clearShadowTraces = (): void => {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(SHADOW_TRACE_KEY);
};
