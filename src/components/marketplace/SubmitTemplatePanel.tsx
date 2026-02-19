import React, { useMemo, useState } from 'react';
import {
  submitTemplateContribution,
  validateTemplate,
  type PersonaTemplate,
  type TemplateCategory,
  type TemplateItem,
} from '../../marketplace';

interface SubmitTemplatePanelProps {
  userId: string;
  panelClassName?: string;
  onStatus: (message: string) => void;
  onSubmitted?: () => void;
}

interface DraftResult {
  previewTemplate: TemplateItem | null;
  submitTemplate: TemplateItem | null;
  issues: string[];
}

const categories: readonly TemplateCategory[] = [
  'productivity',
  'wellbeing',
  'learning',
  'creative',
  'engineering',
  'operations',
];

const defaultPersonaYaml = `version: "1.0"
core:
  name: "Custom Persona"
  essence: "Focused and practical collaborator"
communication:
  tone: "clear"
behavior:
  response_pacing: "balanced"
boundaries:
  hard: ["No fabricated data"]`;

const defaultPanelClass =
  'rounded-xl border border-[#313d45] bg-[#111b21] p-4 text-sm text-[#c7d0d6]';

const toTags = (value: string): string[] => {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
};

const isTemplateCandidate = (value: unknown): value is TemplateItem => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as {
    kind?: unknown;
    metadata?: {
      id?: unknown;
      name?: unknown;
      description?: unknown;
      category?: unknown;
      tags?: unknown;
      author?: unknown;
      version?: unknown;
      createdAtIso?: unknown;
      updatedAtIso?: unknown;
    };
  };
  if (candidate.kind !== 'persona' && candidate.kind !== 'workflow') return false;
  if (!candidate.metadata || typeof candidate.metadata !== 'object') return false;

  return (
    typeof candidate.metadata.id === 'string' &&
    typeof candidate.metadata.name === 'string' &&
    typeof candidate.metadata.description === 'string' &&
    typeof candidate.metadata.category === 'string' &&
    Array.isArray(candidate.metadata.tags) &&
    typeof candidate.metadata.author === 'string' &&
    typeof candidate.metadata.version === 'string' &&
    typeof candidate.metadata.createdAtIso === 'string' &&
    typeof candidate.metadata.updatedAtIso === 'string'
  );
};

const buildPersonaTemplate = (payload: {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  tags: string;
  author: string;
  version: string;
  summary: string;
  personaYaml: string;
}): PersonaTemplate => {
  const nowIso = new Date().toISOString();

  return {
    kind: 'persona',
    metadata: {
      id: payload.id.trim(),
      name: payload.name.trim(),
      description: payload.description.trim(),
      category: payload.category,
      tags: toTags(payload.tags),
      author: payload.author.trim(),
      version: payload.version.trim(),
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    },
    summary: payload.summary.trim(),
    personaYaml: payload.personaYaml,
  };
};

export const SubmitTemplatePanel: React.FC<SubmitTemplatePanelProps> = ({
  userId,
  panelClassName,
  onStatus,
  onSubmitted,
}) => {
  const [mode, setMode] = useState<'json' | 'persona'>('json');
  const [jsonInput, setJsonInput] = useState('');

  const [personaId, setPersonaId] = useState('persona-community-custom');
  const [personaName, setPersonaName] = useState('Community Persona');
  const [personaDescription, setPersonaDescription] = useState('Persona submitted from the gallery form.');
  const [personaCategory, setPersonaCategory] = useState<TemplateCategory>('creative');
  const [personaTags, setPersonaTags] = useState('community,creative');
  const [personaAuthor, setPersonaAuthor] = useState('Community Creator');
  const [personaVersion, setPersonaVersion] = useState('1.0.0');
  const [personaSummary, setPersonaSummary] = useState('A concise persona profile for collaboration.');
  const [personaYaml, setPersonaYaml] = useState(defaultPersonaYaml);

  const draft = useMemo<DraftResult>(() => {
    if (mode === 'json') {
      const raw = jsonInput.trim();
      if (!raw) {
        return {
          previewTemplate: null,
          submitTemplate: null,
          issues: ['Template JSON is required.'],
        };
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (error) {
        return {
          previewTemplate: null,
          submitTemplate: null,
          issues: [error instanceof Error ? `JSON parse error: ${error.message}` : 'Invalid JSON payload.'],
        };
      }

      if (!isTemplateCandidate(parsed)) {
        return {
          previewTemplate: null,
          submitTemplate: null,
          issues: ['Template JSON must include kind plus complete metadata fields.'],
        };
      }

      const validation = validateTemplate(parsed);
      return {
        previewTemplate: parsed,
        submitTemplate: validation.ok ? parsed : null,
        issues: validation.issues,
      };
    }

    const personaTemplate = buildPersonaTemplate({
      id: personaId,
      name: personaName,
      description: personaDescription,
      category: personaCategory,
      tags: personaTags,
      author: personaAuthor,
      version: personaVersion,
      summary: personaSummary,
      personaYaml,
    });
    const validation = validateTemplate(personaTemplate);

    return {
      previewTemplate: personaTemplate,
      submitTemplate: validation.ok ? personaTemplate : null,
      issues: validation.issues,
    };
  }, [
    jsonInput,
    mode,
    personaAuthor,
    personaCategory,
    personaDescription,
    personaId,
    personaName,
    personaSummary,
    personaTags,
    personaVersion,
    personaYaml,
  ]);

  return (
    <section className={panelClassName ?? defaultPanelClass}>
      <h3 className="mb-2 text-sm font-semibold text-[#e9edef]">Contribution Flow</h3>
      <p className="text-xs text-[#8ea1ab]">
        Submit a full template JSON package or compose a persona directly from YAML.
      </p>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className={`rounded border px-2 py-1 text-xs ${
            mode === 'json'
              ? 'border-[#00a884] bg-[#173b38] text-[#dffaf3]'
              : 'border-[#313d45] bg-[#0f171c] text-[#9fb0ba]'
          }`}
          onClick={() => setMode('json')}
        >
          Template JSON
        </button>
        <button
          type="button"
          className={`rounded border px-2 py-1 text-xs ${
            mode === 'persona'
              ? 'border-[#00a884] bg-[#173b38] text-[#dffaf3]'
              : 'border-[#313d45] bg-[#0f171c] text-[#9fb0ba]'
          }`}
          onClick={() => setMode('persona')}
        >
          Persona YAML Form
        </button>
      </div>

      {mode === 'json' ? (
        <textarea
          value={jsonInput}
          onChange={(event) => setJsonInput(event.target.value)}
          placeholder="Paste persona/workflow template JSON..."
          className="mt-3 h-40 w-full rounded border border-[#313d45] bg-[#0f171c] px-3 py-2 text-xs text-[#dfe7eb]"
        />
      ) : (
        <div className="mt-3 space-y-2 text-xs">
          <div className="grid gap-2 md:grid-cols-2">
            <input
              value={personaId}
              onChange={(event) => setPersonaId(event.target.value)}
              placeholder="Template ID"
              className="rounded border border-[#313d45] bg-[#0f171c] px-3 py-2 text-xs text-[#dfe7eb]"
            />
            <input
              value={personaName}
              onChange={(event) => setPersonaName(event.target.value)}
              placeholder="Template name"
              className="rounded border border-[#313d45] bg-[#0f171c] px-3 py-2 text-xs text-[#dfe7eb]"
            />
            <input
              value={personaDescription}
              onChange={(event) => setPersonaDescription(event.target.value)}
              placeholder="Description"
              className="rounded border border-[#313d45] bg-[#0f171c] px-3 py-2 text-xs text-[#dfe7eb]"
            />
            <select
              value={personaCategory}
              onChange={(event) => setPersonaCategory(event.target.value as TemplateCategory)}
              className="rounded border border-[#313d45] bg-[#0f171c] px-3 py-2 text-xs text-[#dfe7eb]"
            >
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            <input
              value={personaTags}
              onChange={(event) => setPersonaTags(event.target.value)}
              placeholder="Tags (comma-separated)"
              className="rounded border border-[#313d45] bg-[#0f171c] px-3 py-2 text-xs text-[#dfe7eb]"
            />
            <input
              value={personaAuthor}
              onChange={(event) => setPersonaAuthor(event.target.value)}
              placeholder="Author"
              className="rounded border border-[#313d45] bg-[#0f171c] px-3 py-2 text-xs text-[#dfe7eb]"
            />
            <input
              value={personaVersion}
              onChange={(event) => setPersonaVersion(event.target.value)}
              placeholder="Version"
              className="rounded border border-[#313d45] bg-[#0f171c] px-3 py-2 text-xs text-[#dfe7eb]"
            />
            <input
              value={personaSummary}
              onChange={(event) => setPersonaSummary(event.target.value)}
              placeholder="Summary"
              className="rounded border border-[#313d45] bg-[#0f171c] px-3 py-2 text-xs text-[#dfe7eb]"
            />
          </div>
          <textarea
            value={personaYaml}
            onChange={(event) => setPersonaYaml(event.target.value)}
            placeholder="Persona YAML"
            className="h-36 w-full rounded border border-[#313d45] bg-[#0f171c] px-3 py-2 text-xs text-[#dfe7eb]"
          />
        </div>
      )}

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="rounded border border-[#27343d] bg-[#0f171c] p-3">
          <div className="mb-1 text-xs font-semibold text-[#e9edef]">Live Validation</div>
          {draft.issues.length === 0 ? (
            <div className="text-[11px] text-[#a8e5c4]">Template is valid and ready for submission.</div>
          ) : (
            <ul className="list-disc space-y-1 pl-4 text-[11px] text-[#f3c2c2]">
              {draft.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded border border-[#27343d] bg-[#0f171c] p-3 text-xs">
          <div className="mb-1 text-xs font-semibold text-[#e9edef]">Gallery Preview</div>
          {draft.previewTemplate ? (
            <>
              <div className="text-sm text-[#e9edef]">{draft.previewTemplate.metadata.name}</div>
              <div className="mt-1 text-[11px] text-[#8ea1ab]">
                {draft.previewTemplate.kind} • {draft.previewTemplate.metadata.category}
              </div>
              <div className="mt-1 text-[11px] text-[#8ea1ab]">
                {draft.previewTemplate.metadata.description}
              </div>
              <div className="mt-1 text-[11px] text-[#7f929c]">
                Tags: {draft.previewTemplate.metadata.tags.join(', ') || 'n/a'}
              </div>
              {draft.previewTemplate.kind === 'workflow' ? (
                <div className="mt-1 text-[11px] text-[#7f929c]">
                  Steps: {draft.previewTemplate.steps.length} • Trigger: {draft.previewTemplate.triggerType}
                </div>
              ) : (
                <div className="mt-1 text-[11px] text-[#7f929c]">
                  Summary: {draft.previewTemplate.summary || 'n/a'}
                </div>
              )}
            </>
          ) : (
            <div className="text-[11px] text-[#7f929c]">Provide template input to see preview.</div>
          )}
        </div>
      </div>

      <button
        type="button"
        disabled={!draft.submitTemplate}
        className={`mt-3 rounded border px-3 py-1.5 text-xs ${
          draft.submitTemplate
            ? 'border-[#00a884] text-[#aef5e9] hover:bg-[#12453f]'
            : 'cursor-not-allowed border-[#3b4b54] text-[#718690]'
        }`}
        onClick={() => {
          if (!draft.submitTemplate) {
            onStatus('Fix template validation issues before submitting.');
            return;
          }

          try {
            const submission = submitTemplateContribution({
              userId,
              template: draft.submitTemplate,
            });
            onStatus(`Submission ${submission.id} created with status ${submission.status}.`);
            onSubmitted?.();
            if (mode === 'json') {
              setJsonInput('');
            }
          } catch (error) {
            onStatus(error instanceof Error ? error.message : 'Failed to submit template.');
          }
        }}
      >
        Submit Template
      </button>
    </section>
  );
};

export default SubmitTemplatePanel;
