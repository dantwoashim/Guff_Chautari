import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearShadowTraces,
  getShadowTraceByAssistantMessage,
  isShadowModeEnabled,
  linkTraceToAssistantMessage,
  recordShadowTrace,
  setShadowModeEnabled,
} from '../shadowMode';

describe('shadow mode observability', () => {
  beforeEach(() => {
    window.localStorage.clear();
    clearShadowTraces();
  });

  it('stores and resolves reasoning traces by assistant message id', () => {
    const trace = recordShadowTrace({
      traceId: 'trace-1',
      sessionId: 'session-1',
      assistantMessageIds: [],
      createdAtIso: '2026-02-18T15:00:00.000Z',
      model: 'gemini-2.5-flash',
      provider: 'gemini',
      promptPreview: 'be concise',
      emotionalSummary: 'calm',
      memoryIds: ['m-1'],
      stages: [{ id: 'contextGatherer', summary: 'loaded 1 memory' }],
    });

    const linked = linkTraceToAssistantMessage({
      traceId: trace.traceId,
      assistantMessageId: 'msg-ai-1',
    });
    expect(linked?.assistantMessageIds).toContain('msg-ai-1');

    const resolved = getShadowTraceByAssistantMessage('msg-ai-1');
    expect(resolved?.traceId).toBe('trace-1');
    expect(resolved?.stages[0].id).toBe('contextGatherer');
  });

  it('toggles shadow mode setting for UI rendering', () => {
    expect(isShadowModeEnabled()).toBe(false);
    setShadowModeEnabled(true);
    expect(isShadowModeEnabled()).toBe(true);
    setShadowModeEnabled(false);
    expect(isShadowModeEnabled()).toBe(false);
  });
});
