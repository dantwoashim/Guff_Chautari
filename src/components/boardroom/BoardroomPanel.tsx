import React, { useMemo, useState } from 'react';
import type { Persona } from '../../../types';
import {
  buildBoardroomFramingFromDecision,
  createBoardroomSessionFromDecision,
  exportBoardroomConsensusToDecisionEvidence,
  persistBoardroomConclusion,
  runBoardroomDebate,
  scoreBoardroomConsensus,
  type Argument,
  type BoardroomSession,
  type DebatePipelineRunner,
  type DebateTurnMode,
} from '../../boardroom';
import { listCouncils } from '../../council';
import type { DecisionMatrix } from '../../decision';
import { BYOKKeyManager } from '../../byok/keyManager';

interface BoardroomPanelProps {
  userId: string;
  personas: ReadonlyArray<Persona>;
  decisionMatrix?: DecisionMatrix;
  threadId?: string | null;
}

const panelClass = 'rounded-xl border border-[#313d45] bg-[#111b21] p-4 text-sm text-[#c7d0d6]';

const makeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

const scorePercent = (value: number): string => `${Math.round(value * 100)}%`;

const trimToLength = (value: string, maxLength: number): string => {
  const normalized = value.trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}...`;
};

const consensusTone = (score: number): { label: string; colorClass: string } => {
  if (score >= 0.75) {
    return { label: 'High convergence', colorClass: 'bg-emerald-500' };
  }
  if (score >= 0.55) {
    return { label: 'Moderate convergence', colorClass: 'bg-sky-500' };
  }
  return { label: 'Low convergence', colorClass: 'bg-amber-500' };
};

const createSimulationRunner = (): DebatePipelineRunner => {
  return async ({ member, round, turnIndex, priorArguments }) => {
    const latestCounterTarget = [...priorArguments]
      .reverse()
      .find((entry) => entry.memberId !== member.id)?.id;
    const positions: Array<'support' | 'mixed' | 'oppose'> = ['support', 'mixed', 'oppose'];
    const position = positions[turnIndex % positions.length];
    const confidence = Number((0.58 + ((round + turnIndex) % 4) * 0.08).toFixed(2));

    return {
      text: JSON.stringify({
        position,
        claim: `${member.name} ${position === 'support' ? 'supports' : position === 'oppose' ? 'opposes' : 'partially supports'} the current framing in round ${round}.`,
        evidence: [
          `${member.name.toLowerCase()}-evidence-${round}`,
          `constraint-check-${(turnIndex % 3) + 1}`,
        ],
        confidence,
        counterArgumentToId: latestCounterTarget,
      }),
    };
  };
};

const buildManualSession = (input: {
  userId: string;
  councilId: string;
  framingPrompt: string;
  mode: DebateTurnMode;
  roundCount: number;
  maxTokensPerTurn: number;
  maxDurationMsPerTurn: number;
}): BoardroomSession => {
  const nowIso = new Date().toISOString();
  return {
    id: makeId('boardroom-session'),
    userId: input.userId,
    councilId: input.councilId,
    framingPrompt: input.framingPrompt.trim(),
    mode: input.mode,
    roundCount: Math.max(1, input.roundCount),
    limits: {
      maxTokensPerTurn: Math.max(120, input.maxTokensPerTurn),
      maxDurationMsPerTurn: Math.max(1_000, input.maxDurationMsPerTurn),
    },
    status: 'running',
    startedAtIso: nowIso,
  };
};

export const BoardroomPanel: React.FC<BoardroomPanelProps> = ({
  userId,
  personas,
  decisionMatrix,
  threadId,
}) => {
  const [refreshTick, setRefreshTick] = useState(0);
  const [selectedCouncilId, setSelectedCouncilId] = useState<string | null>(null);
  const [framingPrompt, setFramingPrompt] = useState(
    decisionMatrix
      ? buildBoardroomFramingFromDecision(decisionMatrix)
      : 'What is the best execution path for the next 30 days, and why?'
  );
  const [mode, setMode] = useState<DebateTurnMode>('round_robin');
  const [roundCount, setRoundCount] = useState(2);
  const [maxTokensPerTurn, setMaxTokensPerTurn] = useState(320);
  const [maxDurationMsPerTurn, setMaxDurationMsPerTurn] = useState(6_000);
  const [importedDecisionMatrixId, setImportedDecisionMatrixId] = useState<string | null>(
    decisionMatrix?.id ?? null
  );
  const [activeSession, setActiveSession] = useState<BoardroomSession | null>(null);
  const [debateArguments, setDebateArguments] = useState<Argument[]>([]);
  const [consensusScore, setConsensusScore] = useState<ReturnType<typeof scoreBoardroomConsensus> | null>(
    null
  );
  const [status, setStatus] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [runMode, setRunMode] = useState<'pipeline' | 'simulation' | null>(null);

  const councils = useMemo(() => {
    void refreshTick;
    return listCouncils(userId);
  }, [refreshTick, userId]);

  const selectedCouncil = useMemo(() => {
    if (councils.length === 0) return null;
    if (!selectedCouncilId) return councils[0];
    return councils.find((council) => council.id === selectedCouncilId) ?? councils[0];
  }, [councils, selectedCouncilId]);

  const argumentById = useMemo(() => {
    return new Map(debateArguments.map((argument) => [argument.id, argument]));
  }, [debateArguments]);

  const orderedArguments = useMemo(() => {
    return [...debateArguments].sort((left, right) => left.turnIndex - right.turnIndex);
  }, [debateArguments]);

  const handleImportDecision = () => {
    if (!decisionMatrix) {
      setStatus('No Decision Room matrix is currently available to import.');
      return;
    }
    setImportedDecisionMatrixId(decisionMatrix.id);
    setFramingPrompt(buildBoardroomFramingFromDecision(decisionMatrix));
    setStatus(`Imported Decision Room session "${decisionMatrix.id}" into boardroom framing.`);
  };

  const handleRunDebate = async () => {
    if (!selectedCouncil) {
      setStatus('No council selected. Create one in Council Room first.');
      return;
    }
    if (!framingPrompt.trim()) {
      setStatus('Framing prompt is required.');
      return;
    }

    setIsRunning(true);
    setStatus('Starting boardroom debate...');
    try {
      const session =
        importedDecisionMatrixId && decisionMatrix && importedDecisionMatrixId === decisionMatrix.id
          ? createBoardroomSessionFromDecision({
              userId,
              councilId: selectedCouncil.id,
              matrix: decisionMatrix,
              mode,
              roundCount,
              limits: {
                maxTokensPerTurn,
                maxDurationMsPerTurn,
              },
            })
          : buildManualSession({
              userId,
              councilId: selectedCouncil.id,
              framingPrompt,
              mode,
              roundCount,
              maxTokensPerTurn,
              maxDurationMsPerTurn,
            });

      const apiKey = await BYOKKeyManager.getDecryptedKey('gemini');
      const simulationRunner = createSimulationRunner();
      const result = await runBoardroomDebate({
        session,
        council: selectedCouncil,
        apiKey: apiKey ?? undefined,
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        pipelineRunner: apiKey ? undefined : simulationRunner,
      });

      const consensus = scoreBoardroomConsensus({
        sessionId: session.id,
        council: selectedCouncil,
        arguments: result.arguments,
      });

      setRunMode(apiKey ? 'pipeline' : 'simulation');
      setActiveSession(session);
      setDebateArguments(result.arguments);
      setConsensusScore(consensus);

      persistBoardroomConclusion({
        userId,
        session,
        arguments: result.arguments,
        consensus,
        threadId: threadId ?? undefined,
      });

      setStatus(
        `Debate completed with ${result.arguments.length} turns. Consensus ${scorePercent(
          consensus.score
        )}.`
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Boardroom debate failed.');
    } finally {
      setIsRunning(false);
    }
  };

  const handleExportToDecision = () => {
    if (!activeSession || !consensusScore) {
      setStatus('Run a boardroom debate before exporting consensus.');
      return;
    }

    const matrixId = importedDecisionMatrixId ?? decisionMatrix?.id;
    if (!matrixId) {
      setStatus('Import a Decision Room session first to export boardroom consensus.');
      return;
    }

    const evidence = exportBoardroomConsensusToDecisionEvidence({
      userId,
      matrixId,
      session: activeSession,
      consensus: consensusScore,
      arguments: debateArguments,
    });
    setStatus(`Consensus exported to Decision Room evidence (${evidence.id}).`);
  };

  const consensusToneState = consensusTone(consensusScore?.score ?? 0);

  return (
    <div className="h-full overflow-y-auto bg-[#0b141a] p-4">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#e9edef]">AI Boardroom</h2>
            <p className="text-sm text-[#8696a0]">
              Turn-based multi-persona debates with consensus scoring, argument threading, and Decision Room bridge.
            </p>
          </div>
          <div className="text-xs text-[#8696a0]">
            {councils.length} council(s) • {personas.length} persona(s)
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <section className={panelClass}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#e9edef]">Session Setup</h3>
              <button
                type="button"
                className="rounded border border-[#313d45] px-2 py-1 text-[11px] text-[#b9c8d0] hover:bg-[#1a262d]"
                onClick={() => setRefreshTick((tick) => tick + 1)}
              >
                Refresh Councils
              </button>
            </div>

            <label className="mb-2 block text-[11px] uppercase tracking-wide text-[#8ea0aa]">
              Council
              <select
                value={selectedCouncil?.id ?? ''}
                onChange={(event) => setSelectedCouncilId(event.target.value)}
                className="mt-1 w-full rounded border border-[#313d45] bg-[#0f171c] px-3 py-2 text-sm text-[#dfe7eb]"
              >
                {councils.length === 0 ? <option value="">No councils available</option> : null}
                {councils.map((council) => (
                  <option key={council.id} value={council.id}>
                    {council.name} ({council.members.length})
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block text-[11px] uppercase tracking-wide text-[#8ea0aa]">
                Mode
                <select
                  value={mode}
                  onChange={(event) => setMode(event.target.value as DebateTurnMode)}
                  className="mt-1 w-full rounded border border-[#313d45] bg-[#0f171c] px-2 py-2 text-xs text-[#dfe7eb]"
                >
                  <option value="round_robin">Round Robin</option>
                  <option value="moderator_directed">Moderator Directed</option>
                </select>
              </label>

              <label className="block text-[11px] uppercase tracking-wide text-[#8ea0aa]">
                Rounds
                <input
                  type="number"
                  min={1}
                  max={4}
                  value={roundCount}
                  onChange={(event) => setRoundCount(Number(event.target.value))}
                  className="mt-1 w-full rounded border border-[#313d45] bg-[#0f171c] px-2 py-2 text-xs text-[#dfe7eb]"
                />
              </label>
            </div>

            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="block text-[11px] uppercase tracking-wide text-[#8ea0aa]">
                Token Limit
                <input
                  type="number"
                  min={120}
                  max={1200}
                  step={10}
                  value={maxTokensPerTurn}
                  onChange={(event) => setMaxTokensPerTurn(Number(event.target.value))}
                  className="mt-1 w-full rounded border border-[#313d45] bg-[#0f171c] px-2 py-2 text-xs text-[#dfe7eb]"
                />
              </label>

              <label className="block text-[11px] uppercase tracking-wide text-[#8ea0aa]">
                Turn Timeout (ms)
                <input
                  type="number"
                  min={1000}
                  max={30000}
                  step={500}
                  value={maxDurationMsPerTurn}
                  onChange={(event) => setMaxDurationMsPerTurn(Number(event.target.value))}
                  className="mt-1 w-full rounded border border-[#313d45] bg-[#0f171c] px-2 py-2 text-xs text-[#dfe7eb]"
                />
              </label>
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded border border-[#00a884] px-3 py-1.5 text-xs text-[#b9fff0] hover:bg-[#12453f]"
                onClick={handleImportDecision}
                disabled={!decisionMatrix}
              >
                Import Decision Room
              </button>
              <button
                type="button"
                className="rounded border border-[#00a884] px-3 py-1.5 text-xs text-[#b9fff0] hover:bg-[#12453f] disabled:opacity-60"
                onClick={() => {
                  void handleRunDebate();
                }}
                disabled={isRunning || !selectedCouncil}
              >
                {isRunning ? 'Running Debate...' : 'Run Boardroom Debate'}
              </button>
              <button
                type="button"
                className="rounded border border-[#3b82f6] px-3 py-1.5 text-xs text-[#bfdbfe] hover:bg-[#1e3a8a]/30"
                onClick={handleExportToDecision}
                disabled={!activeSession || !consensusScore}
              >
                Export to Decision Room
              </button>
            </div>
          </section>

          <section className={`${panelClass} lg:col-span-2`}>
            <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Debate Framing Prompt</h3>
            <textarea
              value={framingPrompt}
              onChange={(event) => setFramingPrompt(event.target.value)}
              className="h-40 w-full rounded border border-[#313d45] bg-[#0f171c] px-3 py-2 text-sm text-[#dfe7eb]"
            />
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[#8ea0aa]">
              <span>
                Linked decision: {importedDecisionMatrixId ?? 'none'}
              </span>
              <span>
                Last run mode: {runMode ?? 'not started'}
              </span>
              {activeSession ? <span>Session: {activeSession.id}</span> : null}
            </div>
          </section>
        </div>

        {consensusScore ? (
          <section className={panelClass}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#e9edef]">Consensus Meter</h3>
              <span className="text-xs text-[#8ea0aa]">
                {consensusToneState.label} • {scorePercent(consensusScore.score)}
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-[#1d2a32]">
              <div
                className={`h-full ${consensusToneState.colorClass}`}
                style={{ width: `${Math.round(consensusScore.score * 100)}%` }}
              />
            </div>
            <div className="mt-3 grid gap-2 text-xs text-[#9fb1ba] sm:grid-cols-2">
              <div className="rounded border border-[#2a3740] bg-[#0f171c] p-2">
                <div className="mb-1 text-[11px] uppercase text-[#7f929c]">Convergence Zones</div>
                {consensusScore.convergenceZones.length === 0 ? (
                  <div>None detected</div>
                ) : (
                  <ul className="list-disc space-y-1 pl-4">
                    {consensusScore.convergenceZones.map((zone) => (
                      <li key={zone}>{zone}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded border border-[#2a3740] bg-[#0f171c] p-2">
                <div className="mb-1 text-[11px] uppercase text-[#7f929c]">Unresolved Tensions</div>
                {consensusScore.unresolvedTensions.length === 0 ? (
                  <div>None detected</div>
                ) : (
                  <ul className="list-disc space-y-1 pl-4">
                    {consensusScore.unresolvedTensions.map((tension) => (
                      <li key={tension}>{tension}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
        ) : null}

        <section className={panelClass}>
          <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Debate Timeline</h3>
          {orderedArguments.length === 0 ? (
            <div className="rounded border border-[#2d3942] bg-[#0f171c] p-3 text-xs text-[#8ea1ab]">
              No turns recorded yet.
            </div>
          ) : (
            <div className="space-y-2">
              {orderedArguments.map((argument) => {
                const parent = argument.counterArgumentToId
                  ? argumentById.get(argument.counterArgumentToId)
                  : null;
                return (
                  <article key={argument.id} className="rounded border border-[#27343d] bg-[#0f171c] p-3">
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-[#8ea0aa]">
                      <span className="rounded border border-[#31424b] px-2 py-0.5">
                        Round {argument.round}
                      </span>
                      <span className="rounded border border-[#31424b] px-2 py-0.5">
                        Turn {argument.turnIndex + 1}
                      </span>
                      <span className="rounded border border-[#31424b] px-2 py-0.5">
                        {argument.position}
                      </span>
                      <span className="rounded border border-[#31424b] px-2 py-0.5">
                        Confidence {scorePercent(argument.confidence)}
                      </span>
                    </div>
                    <div className="mb-1 text-sm font-semibold text-[#e9edef]">{argument.memberName}</div>
                    <p className="text-sm text-[#d2dee4]">{argument.claim}</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[#9fb1ba]">
                      {argument.supportingEvidence.map((evidence) => (
                        <li key={`${argument.id}-${evidence}`}>{evidence}</li>
                      ))}
                    </ul>
                    {parent ? (
                      <div className="mt-2 rounded border border-[#3f2f2b] bg-[#2a1d19] p-2 text-xs text-[#f4c8b5]">
                        Counter-argument to <strong>{parent.memberName}</strong>: {trimToLength(parent.claim, 150)}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {status ? (
          <div className="rounded border border-[#31596b] bg-[#102531] px-3 py-2 text-xs text-[#b8dbeb]">
            {status}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default BoardroomPanel;
