import { describe, expect, it } from 'vitest';
import { processVoiceCapture } from '../voice';
import { buildNextActionWidget, buildOutcomeWidget, buildQuickCaptureWidget } from '../widgets';
import { buildWatchSnapshot } from '../watch';
import { resolveAdaptiveTheme, resolveHapticPattern } from '../ui';
import { DEFAULT_MOBILE_PERF_BUDGET, evaluateMobilePerfBudget } from '../perf';
import { validateCrossPlatformSync } from '../validation';

describe('week 92-93 native capabilities + polish', () => {
  it('converts voice capture into knowledge artifact', () => {
    const result = processVoiceCapture({
      transcript: 'Capture sprint blocker and create a workflow follow-up',
      source: 'assistant_shortcut',
      capturedAtIso: '2026-12-03T08:30:00.000Z',
    });

    expect(result.command.source).toBe('assistant_shortcut');
    expect(result.knowledgeEntry.content).toContain('workflow');
  });

  it('builds widget + watch payloads for quick actions', () => {
    const quickCapture = buildQuickCaptureWidget(3);
    const outcome = buildOutcomeWidget({ completedToday: 2, totalToday: 5 });
    const nextAction = buildNextActionWidget({ label: 'Approve checkpoint', route: '/workflow' });
    const watch = buildWatchSnapshot({
      pendingCheckpointCount: 1,
      pendingNotificationCount: 4,
      permissions: { microphone: true },
    });

    expect(quickCapture.pendingDraftCount).toBe(3);
    expect(outcome.totalToday).toBe(5);
    expect(nextAction.route).toBe('/workflow');
    expect(watch.canCaptureVoiceNote).toBe(true);
  });

  it('resolves haptics/theme and validates perf + cross-platform sync SLOs', () => {
    const haptic = resolveHapticPattern('checkpoint_approved');
    const theme = resolveAdaptiveTheme({ mode: 'dark', fontScale: 1.1, personaAccent: '#22d3ee' });

    expect(haptic.intensity).toBe('medium');
    expect(theme.primaryAccent).toBe('#22d3ee');

    const perfReport = evaluateMobilePerfBudget(
      {
        coldStartMs: 1800,
        conversationListRenderMs: 85,
        syncRoundtripMs: 2200,
      },
      DEFAULT_MOBILE_PERF_BUDGET
    );

    expect(perfReport.passed).toBe(true);

    const syncReport = validateCrossPlatformSync([
      {
        id: 'e1',
        type: 'message.created',
        producedAtIso: '2026-12-03T09:00:00.000Z',
        consumedAtIso: '2026-12-03T09:00:02.500Z',
      },
      {
        id: 'e2',
        type: 'workflow.approved',
        producedAtIso: '2026-12-03T09:01:00.000Z',
        consumedAtIso: '2026-12-03T09:01:01.200Z',
      },
      {
        id: 'e3',
        type: 'knowledge.created',
        producedAtIso: '2026-12-03T09:02:00.000Z',
        consumedAtIso: '2026-12-03T09:02:02.700Z',
      },
    ]);

    expect(syncReport.passed).toBe(true);
    expect(syncReport.checks).toHaveLength(3);
  });
});
