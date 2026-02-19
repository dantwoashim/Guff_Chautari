export type TelemetryEventName =
  | 'message.user.sent'
  | 'message.voice.failed'
  | 'message.user.queued_offline'
  | 'message.user.flushed_from_queue'
  | 'message.user.flush_failed'
  | 'ai.response.started'
  | 'ai.response.chunk'
  | 'ai.response.completed'
  | 'ai.response.failed'
  | 'pwa.sw.registered'
  | 'pwa.sw.registration_failed'
  | 'pwa.install.prompt_available'
  | 'pwa.install.accepted'
  | 'pwa.install.dismissed'
  | 'pwa.install.completed';

export interface TelemetryEvent {
  id: string;
  name: TelemetryEventName;
  traceId: string;
  createdAtIso: string;
  payload: Record<string, string | number | boolean | null>;
}

const STORAGE_KEY = 'ashim.telemetry.events.v1';
const MAX_EVENTS = 400;

const canUseStorage = (): boolean => {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
};

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

const readEvents = (): TelemetryEvent[] => {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TelemetryEvent[]) : [];
  } catch {
    return [];
  }
};

const writeEvents = (events: TelemetryEvent[]): void => {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
  } catch {
    // Ignore storage quota errors and keep runtime non-blocking.
  }
};

export const createTraceId = (prefix = 'trace'): string => makeId(prefix);

export const trackTelemetryEvent = (
  name: TelemetryEventName,
  payload: Record<string, string | number | boolean | null> = {},
  traceId: string = createTraceId()
): TelemetryEvent => {
  const event: TelemetryEvent = {
    id: makeId('event'),
    name,
    traceId,
    createdAtIso: new Date().toISOString(),
    payload,
  };

  const existing = readEvents();
  writeEvents([...existing, event]);
  // Structured log for quick debugging without external tooling.
  console.info('[telemetry]', event);
  return event;
};

export const listTelemetryEvents = (limit = 100): TelemetryEvent[] => {
  const events = readEvents();
  return events.slice(-Math.max(1, limit));
};

export const clearTelemetryEvents = (): void => {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(STORAGE_KEY);
};
