import React, { useMemo, useState } from 'react';
import type { AshimPlugin, PluginPanelContext } from '../../../../packages/sdk/src';

interface FocusSession {
  id: string;
  durationMinutes: number;
  completedAtIso: string;
}

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

const readSessions = (context: PluginPanelContext): FocusSession[] => {
  return context.readStorage<FocusSession[]>('focus_sessions') ?? [];
};

const writeSessions = (context: PluginPanelContext, sessions: FocusSession[]): void => {
  context.writeStorage('focus_sessions', sessions);
};

const PomodoroPanel: React.FC<{ context: PluginPanelContext }> = ({ context }) => {
  const [minutes, setMinutes] = useState(25);
  const [isRunning, setIsRunning] = useState(false);
  const [lastCompletedIso, setLastCompletedIso] = useState<string | null>(null);

  const sessions = useMemo(() => readSessions(context), [context]);
  const totalMinutes = sessions.reduce((sum, session) => sum + session.durationMinutes, 0);

  const completeSession = () => {
    const nowIso = new Date().toISOString();
    const nextSessions: FocusSession[] = [
      ...sessions,
      {
        id: makeId('focus-session'),
        durationMinutes: minutes,
        completedAtIso: nowIso,
      },
    ];

    writeSessions(context, nextSessions);
    setLastCompletedIso(nowIso);
    setIsRunning(false);

    context.notify({
      level: 'info',
      message: `Pomodoro session completed (${minutes} min).`,
    });

    context.emitActivity({
      eventType: 'plugin.pomodoro.session_completed',
      title: 'Pomodoro session completed',
      description: `${minutes} minute focus block completed.`,
    });
  };

  return (
    <div className="space-y-3 rounded border border-[#27343d] bg-[#0f171c] p-3 text-xs text-[#c6d4db]">
      <div className="text-sm text-[#e9edef]">Pomodoro Timer</div>
      <div className="text-[#9fb0ba]">Track focused work sessions and capture lightweight productivity stats.</div>

      <div className="flex items-center gap-2">
        <label htmlFor="pomodoro-minutes" className="text-[#8ea1ab]">
          Minutes
        </label>
        <input
          id="pomodoro-minutes"
          type="number"
          min={5}
          max={120}
          value={minutes}
          onChange={(event) => setMinutes(Math.max(5, Math.min(120, Number(event.target.value) || 25)))}
          className="w-20 rounded border border-[#313d45] bg-[#111b21] px-2 py-1 text-xs text-[#dfe7eb]"
        />
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          className="rounded border border-[#00a884] px-2 py-1 text-xs text-[#aef5e9] hover:bg-[#12453f]"
          onClick={() => setIsRunning(true)}
        >
          Start
        </button>
        <button
          type="button"
          className="rounded border border-[#4f6f84] px-2 py-1 text-xs text-[#bfd8e8] hover:bg-[#1d3140]"
          onClick={completeSession}
          disabled={!isRunning}
        >
          Complete
        </button>
      </div>

      <div className="rounded border border-[#27343d] bg-[#111b21] p-2 text-[11px] text-[#9fb0ba]">
        Status: {isRunning ? `Running ${minutes}m focus block` : 'Idle'}
      </div>

      <div className="rounded border border-[#27343d] bg-[#111b21] p-2 text-[11px] text-[#9fb0ba]">
        Total sessions: {sessions.length} • Total minutes: {totalMinutes}
      </div>

      {lastCompletedIso ? (
        <div className="text-[11px] text-[#8ea1ab]">Last completed: {new Date(lastCompletedIso).toLocaleString()}</div>
      ) : null}

      {context.notifications.length > 0 ? (
        <div>
          <div className="mb-1 text-[11px] uppercase text-[#7f929c]">Recent Notifications</div>
          <ul className="space-y-1 text-[11px] text-[#9fb0ba]">
            {context.notifications.slice(0, 3).map((notification) => (
              <li key={notification.id}>{notification.message}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
};

export const pomodoroPlugin: AshimPlugin = {
  manifest: {
    id: 'pomodoro',
    name: 'Pomodoro Timer',
    version: '1.0.0',
    description: 'Focus session tracker with notifications and plugin tool hooks.',
    permissions: ['notifications.write', 'storage.read', 'storage.write', 'activity.write', 'tools.execute'],
  },
  panelDefinitions: [
    {
      id: 'pomodoro-panel',
      title: 'Pomodoro',
      slot: 'primary',
      render: (context) => <PomodoroPanel context={context} />,
    },
    {
      id: 'pomodoro-sandbox',
      title: 'Pomodoro Sandbox',
      slot: 'secondary',
      renderMode: 'iframe',
      iframeHeightPx: 220,
      iframeSrcDoc: `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { margin: 0; font-family: Arial, sans-serif; background: #0f171c; color: #dfe7eb; }
    .card { border: 1px solid #27343d; border-radius: 8px; margin: 8px; padding: 10px; }
    button { border: 1px solid #4f6f84; background: #1d3140; color: #bfd8e8; border-radius: 6px; padding: 6px 10px; cursor: pointer; }
  </style>
</head>
<body>
  <div class="card">
    <div><strong>Sandbox Panel</strong></div>
    <p style="font-size:12px; color:#9fb0ba;">Isolated iframe rendering for plugin safety testing.</p>
    <button id="ping">Send Ping</button>
  </div>
  <script>
    const button = document.getElementById('ping');
    if (button) {
      button.addEventListener('click', () => {
        parent.postMessage({ type: 'plugin:sandbox_ping', payload: { source: 'pomodoro' } }, '*');
      });
    }
  </script>
</body>
</html>`,
      render: () => null,
    },
  ],
  toolDefinitions: [
    {
      id: 'get_focus_stats',
      title: 'Get Focus Stats',
      description: 'Return completed focus session stats.',
      mutation: false,
      idempotent: true,
      async execute(_payload, context) {
        const sessions = context.readStorage<FocusSession[]>('focus_sessions') ?? [];
        const totalMinutes = sessions.reduce((sum, session) => sum + session.durationMinutes, 0);
        return {
          ok: true,
          summary: `Focus stats: ${sessions.length} sessions, ${totalMinutes} minutes total.`,
          data: {
            sessionCount: sessions.length,
            totalMinutes,
          },
        };
      },
    },
    {
      id: 'reset_focus_sessions',
      title: 'Reset Focus Sessions',
      description: 'Clear all stored focus sessions.',
      mutation: true,
      idempotent: false,
      async execute(_payload, context) {
        context.writeStorage('focus_sessions', []);
        return {
          ok: true,
          summary: 'Focus sessions cleared.',
        };
      },
    },
  ],
  hooks: {
    onActivate(context) {
      context.emitActivity({
        eventType: 'plugin.pomodoro.activated',
        title: 'Pomodoro plugin activated',
        description: 'Pomodoro plugin is ready for focus tracking.',
      });
    },
  },
};
