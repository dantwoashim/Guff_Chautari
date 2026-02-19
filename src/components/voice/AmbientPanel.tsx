import React, { useMemo, useState } from 'react';
import {
  buildAmbientPreview,
  createDefaultAmbientModeSettings,
  type AmbientModeSettings,
  type AmbientNotificationIntensity,
} from '../../voice/ambientMode';
import {
  createDefaultQuietWindowsConfig,
  type QuietWindowsConfig,
} from '../../voice/quietWindows';

interface AmbientPanelProps {
  userId: string;
}

const STORAGE_PREFIX = 'ashim.voice.ambient.v1';

const panelClass = 'rounded-xl border border-[#313d45] bg-[#111b21] p-4';

const readStoredSettings = (userId: string): AmbientModeSettings => {
  const defaults = createDefaultAmbientModeSettings();
  if (typeof window === 'undefined' || !window.localStorage) return defaults;
  const raw = window.localStorage.getItem(`${STORAGE_PREFIX}.${userId}`);
  if (!raw) return defaults;

  try {
    const parsed = JSON.parse(raw) as Partial<AmbientModeSettings>;
    const quietDefaults = createDefaultQuietWindowsConfig();

    const quietWindows: QuietWindowsConfig = {
      ...quietDefaults,
      ...(parsed.quietWindows ?? {}),
      sleepWindow: {
        ...quietDefaults.sleepWindow,
        ...(parsed.quietWindows?.sleepWindow ?? {}),
      },
      customWindows: Array.isArray(parsed.quietWindows?.customWindows)
        ? parsed.quietWindows!.customWindows
        : quietDefaults.customWindows,
      emergencyOverride: {
        ...quietDefaults.emergencyOverride,
        ...(parsed.quietWindows?.emergencyOverride ?? {}),
      },
    };

    return {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : defaults.enabled,
      notificationIntensity: (['low', 'balanced', 'high'] as const).includes(
        parsed.notificationIntensity as AmbientNotificationIntensity
      )
        ? (parsed.notificationIntensity as AmbientNotificationIntensity)
        : defaults.notificationIntensity,
      checkInHourLocal:
        typeof parsed.checkInHourLocal === 'number'
          ? Math.max(0, Math.min(23, Math.round(parsed.checkInHourLocal)))
          : defaults.checkInHourLocal,
      quietWindows,
    };
  } catch {
    return defaults;
  }
};

const saveStoredSettings = (userId: string, settings: AmbientModeSettings): void => {
  if (typeof window === 'undefined' || !window.localStorage) return;
  window.localStorage.setItem(`${STORAGE_PREFIX}.${userId}`, JSON.stringify(settings));
};

const toLocalDateTimeInput = (iso: string | undefined): string => {
  if (!iso) return '';
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return '';
  const date = new Date(parsed);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const fromLocalDateTimeInput = (value: string): string | undefined => {
  if (!value.trim()) return undefined;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return undefined;
  return new Date(parsed).toISOString();
};

export const AmbientPanel: React.FC<AmbientPanelProps> = ({ userId }) => {
  const [settings, setSettings] = useState<AmbientModeSettings>(() => readStoredSettings(userId));
  const [status, setStatus] = useState('Ambient settings saved locally on this device.');
  const [previewNowIso] = useState(() => new Date().toISOString());
  const [previewLastActivityIso] = useState(() =>
    new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString()
  );

  const updateSettings = (updater: (current: AmbientModeSettings) => AmbientModeSettings): void => {
    setSettings((current) => {
      const next = updater(current);
      saveStoredSettings(userId, next);
      return next;
    });
    setStatus('Settings updated.');
  };

  const preview = useMemo(
    () =>
      buildAmbientPreview({
        settings,
        context: {
          userId,
          lastUserActivityAtIso: previewLastActivityIso,
          emotionalTrend: { direction: 'flat', score: 0.1 },
          calendarEvents: [],
          workflowSignals: [],
          focusSessions: [],
        },
        nowIso: previewNowIso,
        days: 7,
      }),
    [previewLastActivityIso, previewNowIso, settings, userId]
  );

  return (
    <div className="h-full overflow-y-auto bg-[#0b141a] p-4">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className={panelClass}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[#e9edef]">Ambient Mode</h2>
              <p className="text-sm text-[#8696a0]">
                Configure proactive check-ins, quiet windows, and emergency override behavior.
              </p>
            </div>
            <button
              type="button"
              className={`rounded border px-4 py-2 text-xs font-medium transition ${
                settings.enabled
                  ? 'border-[#00a884] bg-[#12453f] text-[#cbfff4]'
                  : 'border-[#313d45] bg-[#202c33] text-[#b4c0c7]'
              }`}
              onClick={() =>
                updateSettings((current) => ({
                  ...current,
                  enabled: !current.enabled,
                }))
              }
            >
              Ambient Mode: {settings.enabled ? 'On' : 'Off'}
            </button>
          </div>
        </header>

        <section className={`${panelClass} grid gap-4 lg:grid-cols-3`}>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-[#8ea1ab]">
              Notification Intensity
            </label>
            <select
              className="w-full rounded border border-[#313d45] bg-[#0f171c] px-3 py-2 text-sm text-[#d8e1e6]"
              value={settings.notificationIntensity}
              onChange={(event) =>
                updateSettings((current) => ({
                  ...current,
                  notificationIntensity: event.target.value as AmbientNotificationIntensity,
                }))
              }
            >
              <option value="low">Low (few check-ins)</option>
              <option value="balanced">Balanced</option>
              <option value="high">High (more proactive)</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-[#8ea1ab]">
              Preferred Check-In Hour
            </label>
            <input
              type="number"
              min={0}
              max={23}
              value={settings.checkInHourLocal}
              onChange={(event) => {
                const nextHour = Number(event.target.value);
                updateSettings((current) => ({
                  ...current,
                  checkInHourLocal: Number.isNaN(nextHour)
                    ? current.checkInHourLocal
                    : Math.max(0, Math.min(23, Math.round(nextHour))),
                }));
              }}
              className="w-full rounded border border-[#313d45] bg-[#0f171c] px-3 py-2 text-sm text-[#d8e1e6]"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-[#8ea1ab]">
              Manual DND Until
            </label>
            <input
              type="datetime-local"
              value={toLocalDateTimeInput(settings.quietWindows.manualDndUntilIso)}
              onChange={(event) => {
                const nextIso = fromLocalDateTimeInput(event.target.value);
                updateSettings((current) => ({
                  ...current,
                  quietWindows: {
                    ...current.quietWindows,
                    manualDndUntilIso: nextIso,
                  },
                }));
              }}
              className="w-full rounded border border-[#313d45] bg-[#0f171c] px-3 py-2 text-sm text-[#d8e1e6]"
            />
          </div>
        </section>

        <section className={`${panelClass} grid gap-4 lg:grid-cols-2`}>
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-[#e9edef]">Quiet Windows</h3>
            <label className="flex items-center gap-2 text-sm text-[#c4d0d7]">
              <input
                type="checkbox"
                checked={settings.quietWindows.enabled}
                onChange={(event) =>
                  updateSettings((current) => ({
                    ...current,
                    quietWindows: {
                      ...current.quietWindows,
                      enabled: event.target.checked,
                    },
                  }))
                }
              />
              Enable quiet windows
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-[#8ea1ab]">
                Sleep Start
                <input
                  type="time"
                  value={settings.quietWindows.sleepWindow.startLocalTime}
                  onChange={(event) =>
                    updateSettings((current) => ({
                      ...current,
                      quietWindows: {
                        ...current.quietWindows,
                        sleepWindow: {
                          ...current.quietWindows.sleepWindow,
                          startLocalTime: event.target.value,
                        },
                      },
                    }))
                  }
                  className="mt-1 w-full rounded border border-[#313d45] bg-[#0f171c] px-2 py-2 text-sm text-[#d8e1e6]"
                />
              </label>

              <label className="text-xs text-[#8ea1ab]">
                Sleep End
                <input
                  type="time"
                  value={settings.quietWindows.sleepWindow.endLocalTime}
                  onChange={(event) =>
                    updateSettings((current) => ({
                      ...current,
                      quietWindows: {
                        ...current.quietWindows,
                        sleepWindow: {
                          ...current.quietWindows.sleepWindow,
                          endLocalTime: event.target.value,
                        },
                      },
                    }))
                  }
                  className="mt-1 w-full rounded border border-[#313d45] bg-[#0f171c] px-2 py-2 text-sm text-[#d8e1e6]"
                />
              </label>
            </div>

            <label className="flex items-center gap-2 text-xs text-[#b8c8d0]">
              <input
                type="checkbox"
                checked={settings.quietWindows.focusSessionsEnabled}
                onChange={(event) =>
                  updateSettings((current) => ({
                    ...current,
                    quietWindows: {
                      ...current.quietWindows,
                      focusSessionsEnabled: event.target.checked,
                    },
                  }))
                }
              />
              Respect focus sessions
            </label>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-[#e9edef]">Emergency Overrides</h3>
            <label className="flex items-center gap-2 text-xs text-[#b8c8d0]">
              <input
                type="checkbox"
                checked={settings.quietWindows.emergencyOverride.allowCriticalWorkflowFailures}
                onChange={(event) =>
                  updateSettings((current) => ({
                    ...current,
                    quietWindows: {
                      ...current.quietWindows,
                      emergencyOverride: {
                        ...current.quietWindows.emergencyOverride,
                        allowCriticalWorkflowFailures: event.target.checked,
                      },
                    },
                  }))
                }
              />
              Allow critical workflow failure alerts
            </label>
            <label className="flex items-center gap-2 text-xs text-[#b8c8d0]">
              <input
                type="checkbox"
                checked={settings.quietWindows.emergencyOverride.allowSecurityEvents}
                onChange={(event) =>
                  updateSettings((current) => ({
                    ...current,
                    quietWindows: {
                      ...current.quietWindows,
                      emergencyOverride: {
                        ...current.quietWindows.emergencyOverride,
                        allowSecurityEvents: event.target.checked,
                      },
                    },
                  }))
                }
              />
              Allow security alerts
            </label>

            <button
              type="button"
              className="rounded border border-[#3c4b53] px-3 py-2 text-xs text-[#b7c5cc] hover:bg-[#202c33]"
              onClick={() =>
                updateSettings((current) => ({
                  ...current,
                  quietWindows: {
                    ...current.quietWindows,
                    manualDndUntilIso: undefined,
                  },
                }))
              }
            >
              Clear Manual DND
            </button>
          </div>
        </section>

        <section className={panelClass}>
          <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">
            Check-In Preview (Last 7 Days)
          </h3>
          <div className="space-y-2">
            {preview.map((entry) => (
              <div
                key={entry.atIso}
                className={`rounded border px-3 py-2 text-xs ${
                  entry.decision.action === 'send'
                    ? 'border-[#305f55] bg-[#102823] text-[#c8f2e8]'
                    : 'border-[#384750] bg-[#121d23] text-[#b7c5cc]'
                }`}
              >
                <div className="mb-1 flex items-center justify-between gap-3">
                  <span>{new Date(entry.atIso).toLocaleString()}</span>
                  <span className="uppercase tracking-wide">
                    {entry.decision.action} • {entry.decision.reason}
                  </span>
                </div>
                <div>{entry.decision.message || 'No message (deferred).'}</div>
              </div>
            ))}
          </div>
        </section>

        <div className="rounded border border-[#2f4e5e] bg-[#102531] px-3 py-2 text-xs text-[#b9dbe9]">
          {status}
        </div>
      </div>
    </div>
  );
};

export default AmbientPanel;
