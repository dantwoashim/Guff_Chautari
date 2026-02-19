import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Message } from '../../../types';
import { runReflectionSession } from '@ashim/engine';
import type { ReflectionSession } from '@ashim/engine';
import { emitActivityEvent } from '../../activity';

interface ReflectionDashboardPanelProps {
  userId: string;
  threadId: string;
  personaId: string;
  messages: ReadonlyArray<Message>;
}

const sectionClass =
  'rounded-xl border border-[#313d45] bg-[#111b21] p-4 text-sm text-[#c7d0d6]';

export const ReflectionDashboardPanel: React.FC<ReflectionDashboardPanelProps> = ({
  userId,
  threadId,
  personaId,
  messages,
}) => {
  const emittedSessionIdsRef = useRef<Set<string>>(new Set());
  const reflectionHistory = useMemo<ReflectionSession[]>(() => {
    if (!threadId || !personaId || messages.length < 8) return [];

    const sessions: ReflectionSession[] = [];
    for (let count = 8; count <= messages.length; count += 4) {
      const windowMessages = messages.slice(0, count);
      const now = windowMessages[windowMessages.length - 1]?.timestamp ?? 0;
      sessions.push(
        runReflectionSession({
          threadId,
          personaId,
          messages: windowMessages,
          now,
          config: {
            minConversationMessages: 8,
            reflectionEveryNMessages: 4,
            maxWindow: 40,
          },
        })
      );
    }

    return sessions.reverse();
  }, [messages, personaId, threadId]);

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  useEffect(() => {
    if (reflectionHistory.length === 0) {
      setSelectedSessionId(null);
      return;
    }
    setSelectedSessionId((current) =>
      current && reflectionHistory.some((session) => session.id === current)
        ? current
        : reflectionHistory[0].id
    );
  }, [reflectionHistory]);

  const reflection = useMemo(
    () => reflectionHistory.find((session) => session.id === selectedSessionId) ?? reflectionHistory[0] ?? null,
    [reflectionHistory, selectedSessionId]
  );

  useEffect(() => {
    const latest = reflectionHistory[0];
    if (!latest) return;
    if (emittedSessionIdsRef.current.has(latest.id)) return;

    emittedSessionIdsRef.current.add(latest.id);
    emitActivityEvent({
      userId,
      category: 'reflection',
      eventType: 'reflection.session_generated',
      title: 'Reflection session generated',
      description: `${latest.observations.length} observations and ${latest.patterns.length} patterns computed.`,
      threadId,
    });
  }, [reflectionHistory, threadId, userId]);

  if (!reflection || reflectionHistory.length === 0) {
    return (
      <div className="h-full overflow-y-auto bg-[#0b141a] p-4">
        <div className="mx-auto max-w-5xl space-y-4">
          <h2 className="text-lg font-semibold text-[#e9edef]">Reflection Dashboard</h2>
          <div className={sectionClass}>
            Build up at least 8 messages in this chat to unlock reflection insights.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-[#0b141a] p-4">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#e9edef]">Reflection Dashboard</h2>
            <p className="text-sm text-[#8696a0]">
              Self-observation window: {reflection.windowSize} messages
            </p>
          </div>
          <div className="text-xs text-[#8696a0]">
            {new Date(reflection.createdAt).toLocaleString()}
          </div>
        </div>

        <div className={sectionClass}>
          <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Observations</h3>
          <div className="space-y-2">
            {reflection.observations.map((observation) => (
              <div key={observation.id} className="rounded-lg bg-[#202c33] p-3">
                <p className="text-[#e9edef]">{observation.summary}</p>
                <p className="mt-1 text-xs text-[#8fa2ac]">
                  Confidence: {Math.round(observation.confidence * 100)}%
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className={sectionClass}>
          <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Pattern Signals</h3>
          <div className="space-y-2">
            {reflection.patterns.map((pattern) => (
              <div key={pattern.id} className="flex items-center justify-between rounded-lg bg-[#202c33] p-3">
                <div>
                  <div className="text-[#e9edef]">{pattern.label}</div>
                  <div className="text-xs text-[#8fa2ac]">Kind: {pattern.kind}</div>
                </div>
                <div className="text-right text-xs text-[#8fa2ac]">
                  <div>Count: {pattern.occurrences}</div>
                  <div>Trend: {pattern.trend}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={sectionClass}>
          <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Persona Evolution</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-[#202c33] p-3">
              <div className="mb-1 text-xs uppercase tracking-wide text-[#8fa2ac]">Vocabulary Adds</div>
              <div className="text-sm text-[#dfe7eb]">
                {reflection.evolution.vocabularyAdds.join(', ') || 'None yet'}
              </div>
            </div>
            <div className="rounded-lg bg-[#202c33] p-3">
              <div className="mb-1 text-xs uppercase tracking-wide text-[#8fa2ac]">Interests Added</div>
              <div className="text-sm text-[#dfe7eb]">
                {reflection.evolution.interestsAdded.join(', ') || 'None yet'}
              </div>
            </div>
            <div className="rounded-lg bg-[#202c33] p-3">
              <div className="mb-1 text-xs uppercase tracking-wide text-[#8fa2ac]">Stance Adjustments</div>
              <div className="text-sm text-[#dfe7eb]">
                {reflection.evolution.stanceAdjustments.join(' | ') || 'None yet'}
              </div>
            </div>
          </div>
        </div>

        <div className={sectionClass}>
          <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Reflection History</h3>
          <div className="space-y-2">
            {reflectionHistory.map((session) => {
              const isSelected = session.id === reflection.id;
              return (
                <button
                  key={session.id}
                  type="button"
                  className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition ${
                    isSelected
                      ? 'border-[#00a884] bg-[#173b38] text-[#dffaf3]'
                      : 'border-[#313d45] bg-[#202c33] text-[#9fb0ba] hover:border-[#4a5961]'
                  }`}
                  onClick={() => setSelectedSessionId(session.id)}
                >
                  <div>{new Date(session.createdAt).toLocaleString()}</div>
                  <div className="mt-1">
                    {session.observations.length} observations • {session.patterns.length} patterns
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReflectionDashboardPanel;
