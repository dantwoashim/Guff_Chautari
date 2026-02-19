export interface MobilePerfSnapshot {
  coldStartMs: number;
  conversationListRenderMs: number;
  syncRoundtripMs: number;
}

export interface MobilePerfBudget {
  maxColdStartMs: number;
  maxConversationRenderMs: number;
  maxSyncRoundtripMs: number;
}

export interface MobilePerfEvaluation {
  passed: boolean;
  violations: string[];
}

export const DEFAULT_MOBILE_PERF_BUDGET: MobilePerfBudget = {
  maxColdStartMs: 2000,
  maxConversationRenderMs: 100,
  maxSyncRoundtripMs: 3000,
};

export const evaluateMobilePerfBudget = (
  snapshot: MobilePerfSnapshot,
  budget: MobilePerfBudget = DEFAULT_MOBILE_PERF_BUDGET
): MobilePerfEvaluation => {
  const violations: string[] = [];

  if (snapshot.coldStartMs > budget.maxColdStartMs) {
    violations.push(`cold_start_exceeded:${snapshot.coldStartMs}`);
  }
  if (snapshot.conversationListRenderMs > budget.maxConversationRenderMs) {
    violations.push(`conversation_render_exceeded:${snapshot.conversationListRenderMs}`);
  }
  if (snapshot.syncRoundtripMs > budget.maxSyncRoundtripMs) {
    violations.push(`sync_roundtrip_exceeded:${snapshot.syncRoundtripMs}`);
  }

  return {
    passed: violations.length === 0,
    violations,
  };
};
