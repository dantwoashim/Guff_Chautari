import React, { useMemo, useState } from 'react';
import type { Persona } from '../../../types';
import {
  createCouncil,
  listCouncils,
  runCouncilDebate,
  type CouncilDebateResult,
  type CouncilMemberInput,
} from '../../council';

interface CouncilPanelProps {
  userId: string;
  personas: ReadonlyArray<Persona>;
}

const panelClass = 'rounded-xl border border-[#313d45] bg-[#111b21] p-4 text-sm text-[#c7d0d6]';

export const CouncilPanel: React.FC<CouncilPanelProps> = ({ userId, personas }) => {
  const [refreshTick, setRefreshTick] = useState(0);
  const [name, setName] = useState('Career Board');
  const [description, setDescription] = useState('');
  const [selectedPersonaIds, setSelectedPersonaIds] = useState<string[]>([]);
  const [selectedCouncilId, setSelectedCouncilId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('What should I prioritize this week for highest leverage?');
  const [status, setStatus] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [debateResult, setDebateResult] = useState<CouncilDebateResult | null>(null);

  const councils = useMemo(() => {
    void refreshTick;
    return listCouncils(userId);
  }, [refreshTick, userId]);

  const selectedCouncil = useMemo(() => {
    if (!selectedCouncilId) return councils[0] ?? null;
    return councils.find((item) => item.id === selectedCouncilId) ?? councils[0] ?? null;
  }, [councils, selectedCouncilId]);

  const togglePersona = (personaId: string) => {
    setSelectedPersonaIds((current) =>
      current.includes(personaId)
        ? current.filter((item) => item !== personaId)
        : [...current, personaId].slice(0, 7)
    );
  };

  const handleCreateCouncil = () => {
    if (selectedPersonaIds.length < 3) {
      setStatus('Select at least 3 personas to create a council.');
      return;
    }

    const memberInputs: CouncilMemberInput[] = selectedPersonaIds
      .map((personaId) => personas.find((persona) => persona.id === personaId))
      .filter((persona): persona is Persona => Boolean(persona))
      .map((persona) => ({
        personaId: persona.id,
        name: persona.name,
        roleHint: persona.status_text,
        systemInstruction: persona.system_instruction,
      }));

    try {
      const council = createCouncil({
        userId,
        name,
        description,
        members: memberInputs,
      });
      setSelectedCouncilId(council.id);
      setRefreshTick((tick) => tick + 1);
      setStatus(`Created council "${council.name}" with ${council.members.length} member(s).`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to create council.');
    }
  };

  const handleRunDebate = async () => {
    if (!selectedCouncil) {
      setStatus('Create a council first.');
      return;
    }
    if (!prompt.trim()) {
      setStatus('Prompt is required.');
      return;
    }

    setIsRunning(true);
    try {
      const result = await runCouncilDebate({
        council: selectedCouncil,
        prompt: prompt.trim(),
      });
      setDebateResult(result);
      setStatus(
        `${result.perspectives.length} perspectives generated in ${result.durationMs}ms. Confidence ${Math.round(
          result.synthesis.confidence * 100
        )}%.`
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Council debate failed.');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-[#0b141a] p-4">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#e9edef]">Council Room</h2>
            <p className="text-sm text-[#8696a0]">
              Build 3–7 persona councils, generate sequential perspectives, and synthesize a recommendation.
            </p>
          </div>
          <div className="text-xs text-[#8696a0]">{councils.length} council(s)</div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <section className={panelClass}>
            <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Create Council</h3>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Council name"
              className="mb-2 w-full rounded border border-[#313d45] bg-[#0f171c] px-3 py-2 text-sm text-[#dfe7eb]"
            />
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Purpose (optional)"
              className="mb-2 h-20 w-full rounded border border-[#313d45] bg-[#0f171c] px-3 py-2 text-sm text-[#dfe7eb]"
            />
            <div className="max-h-44 space-y-1 overflow-y-auto rounded border border-[#25313a] bg-[#0f171c] p-2">
              {personas.map((persona) => {
                const selected = selectedPersonaIds.includes(persona.id);
                return (
                  <label
                    key={persona.id}
                    className={`flex cursor-pointer items-center justify-between rounded px-2 py-1 text-xs ${
                      selected ? 'bg-[#1a3f42] text-[#dcfaf4]' : 'text-[#a7b8c1] hover:bg-[#1a242b]'
                    }`}
                  >
                    <span>{persona.name}</span>
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => togglePersona(persona.id)}
                      className="accent-[#00a884]"
                    />
                  </label>
                );
              })}
            </div>
            <button
              type="button"
              className="mt-2 rounded border border-[#00a884] px-3 py-1.5 text-xs text-[#aef5e9] hover:bg-[#12453f]"
              onClick={handleCreateCouncil}
            >
              Save Council
            </button>
          </section>

          <section className={panelClass}>
            <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Councils</h3>
            <div className="space-y-2">
              {councils.length === 0 ? (
                <div className="rounded border border-[#2d3942] bg-[#0f171c] p-3 text-xs text-[#8ea1ab]">
                  No councils created yet.
                </div>
              ) : (
                councils.map((council) => (
                  <button
                    key={council.id}
                    type="button"
                    className={`w-full rounded border px-3 py-2 text-left text-xs ${
                      selectedCouncil?.id === council.id
                        ? 'border-[#00a884] bg-[#173b38] text-[#dffaf3]'
                        : 'border-[#313d45] bg-[#111b21] text-[#9fb0ba] hover:border-[#4a5961]'
                    }`}
                    onClick={() => setSelectedCouncilId(council.id)}
                  >
                    <div className="text-sm text-[#e9edef]">{council.name}</div>
                    <div className="mt-1 text-[11px] text-[#7f929c]">
                      {council.members.length} member(s) • {new Date(council.updatedAtIso).toLocaleString()}
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>

          <section className={panelClass}>
            <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Run Council Prompt</h3>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Enter decision prompt..."
              className="h-32 w-full rounded border border-[#313d45] bg-[#0f171c] px-3 py-2 text-sm text-[#dfe7eb]"
            />
            <button
              type="button"
              className="mt-2 rounded border border-[#00a884] px-3 py-1.5 text-xs text-[#aef5e9] hover:bg-[#12453f] disabled:opacity-60"
              onClick={() => {
                void handleRunDebate();
              }}
              disabled={isRunning}
            >
              {isRunning ? 'Generating...' : 'Generate Perspectives'}
            </button>
          </section>
        </div>

        {debateResult ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <section className={panelClass}>
              <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Member Perspectives</h3>
              <div className="space-y-2">
                {debateResult.perspectives.map((perspective) => (
                  <div key={perspective.id} className="rounded border border-[#27343d] bg-[#0f171c] p-3">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-sm text-[#e9edef]">{perspective.memberName}</span>
                      <span className="text-[11px] uppercase text-[#7f929c]">{perspective.style}</span>
                    </div>
                    <pre className="whitespace-pre-wrap font-sans text-xs text-[#9fb0ba]">
                      {perspective.response}
                    </pre>
                  </div>
                ))}
              </div>
            </section>

            <section className={panelClass}>
              <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Synthesized Recommendation</h3>
              <div className="space-y-2 text-xs text-[#c2d0d7]">
                <div className="rounded border border-[#2b3a44] bg-[#0f171c] p-3">
                  <div className="mb-1 text-[11px] uppercase text-[#7f929c]">Consensus</div>
                  <div>{debateResult.synthesis.consensus}</div>
                </div>
                <div className="rounded border border-[#2b3a44] bg-[#0f171c] p-3">
                  <div className="mb-1 text-[11px] uppercase text-[#7f929c]">Minority View</div>
                  <div>{debateResult.synthesis.minorityView}</div>
                </div>
                <div className="rounded border border-[#2b3a44] bg-[#0f171c] p-3">
                  <div className="mb-1 text-[11px] uppercase text-[#7f929c]">Recommended Action</div>
                  <div>{debateResult.synthesis.recommendedAction}</div>
                </div>
                <div className="rounded border border-[#2b3a44] bg-[#0f171c] p-3">
                  <div className="mb-1 text-[11px] uppercase text-[#7f929c]">Agreements</div>
                  <ul className="list-disc space-y-1 pl-5">
                    {debateResult.synthesis.agreements.map((agreement) => (
                      <li key={agreement}>{agreement}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded border border-[#2b3a44] bg-[#0f171c] p-3">
                  <div className="mb-1 text-[11px] uppercase text-[#7f929c]">Disagreements</div>
                  {debateResult.synthesis.disagreements.length === 0 ? (
                    <div className="text-[#9fb0ba]">No major disagreements detected.</div>
                  ) : (
                    <ul className="list-disc space-y-1 pl-5">
                      {debateResult.synthesis.disagreements.map((disagreement) => (
                        <li key={disagreement}>{disagreement}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="rounded border border-[#2b3a44] bg-[#0f171c] p-3">
                  <div className="mb-1 text-[11px] uppercase text-[#7f929c]">Member References</div>
                  <ul className="list-disc space-y-1 pl-5">
                    {debateResult.synthesis.references.map((reference) => (
                      <li key={reference.memberId}>
                        {reference.memberName} ({reference.style})
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          </div>
        ) : null}

        {status ? (
          <div className="rounded border border-[#31596b] bg-[#102531] px-3 py-2 text-xs text-[#b8dbeb]">
            {status}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default CouncilPanel;
