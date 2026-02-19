export interface CrossPlatformEvent {
  id: string;
  type: 'message.created' | 'workflow.approved' | 'knowledge.created';
  producedAtIso: string;
  consumedAtIso: string;
}

export interface CrossPlatformSyncReport {
  passed: boolean;
  checks: {
    type: CrossPlatformEvent['type'];
    latencyMs: number;
    withinSla: boolean;
  }[];
}

const toMs = (iso: string): number => {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const slaMsByType: Record<CrossPlatformEvent['type'], number> = {
  'message.created': 3_000,
  'workflow.approved': 3_000,
  'knowledge.created': 3_000,
};

export const validateCrossPlatformSync = (
  events: ReadonlyArray<CrossPlatformEvent>
): CrossPlatformSyncReport => {
  const checks = events.map((event) => {
    const latencyMs = Math.max(0, toMs(event.consumedAtIso) - toMs(event.producedAtIso));
    const withinSla = latencyMs <= slaMsByType[event.type];
    return {
      type: event.type,
      latencyMs,
      withinSla,
    };
  });

  return {
    passed: checks.every((check) => check.withinSla),
    checks,
  };
};
