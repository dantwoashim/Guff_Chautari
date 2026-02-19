import { useMemo, useState } from 'react';
import type { Persona } from '../../../types';
import {
  importPersonaYaml,
  type PersonaFormatError,
  type PersonaImportPreview,
} from '../../engine/persona/personaFormat';
import { PersonaImportPreview as PersonaPreviewCard } from './PersonaImportPreview';

interface PersonaImportPanelProps {
  userId: string;
  onImported?: (persona: Persona) => void;
}

const samplePersonaYaml = `version: "1.0"
core:
  name: "Ashim"
  essence: "Practical, emotionally coherent strategic partner"
communication:
  tone: "direct and warm"
  style:
    - "concise"
    - "grounded"
  max_message_length: 700
  emoji_usage: "low"
personality:
  traits:
    - name: "pragmatic"
      weight: 0.82
    - name: "empathetic"
      weight: 0.64
  motivations:
    - "Help user make measurable progress"
  boundaries:
    - "No fabricated claims"
behavior:
  response_pacing: "measured"
  conflict_style: "address directly"
  affection_style: "supportive"
contradictions: []
boundaries:
  hard:
    - "No unsafe instructions"
  soft:
    - "Prefer concise outputs unless asked"
`;

export const PersonaImportPanel = ({ userId, onImported }: PersonaImportPanelProps) => {
  const [rawYaml, setRawYaml] = useState<string>(samplePersonaYaml);
  const [errors, setErrors] = useState<PersonaFormatError[]>([]);
  const [preview, setPreview] = useState<PersonaImportPreview | null>(null);
  const [importedPersona, setImportedPersona] = useState<Persona | null>(null);

  const hasErrors = errors.length > 0;

  const helperText = useMemo(() => {
    if (hasErrors) return `${errors.length} validation issue${errors.length === 1 ? '' : 's'} found`;
    if (importedPersona) return `Imported ${importedPersona.name}`;
    return 'Paste .persona YAML or upload a file';
  }, [errors.length, hasErrors, importedPersona]);

  const runImport = (content: string) => {
    const result = importPersonaYaml(content, { userId });
    if (result.ok === false) {
      setErrors(result.errors);
      setPreview(null);
      setImportedPersona(null);
      return;
    }

    setErrors([]);
    setPreview(result.preview);
    setImportedPersona(result.persona);
    onImported?.(result.persona);
  };

  const onFileChange = async (file: File | null) => {
    if (!file) return;
    const content = await file.text();
    setRawYaml(content);
    runImport(content);
  };

  return (
    <section className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
      <header>
        <h3 className="text-sm font-semibold text-zinc-100">Import Persona</h3>
        <p className="mt-1 text-xs text-zinc-400">{helperText}</p>
      </header>

      <textarea
        value={rawYaml}
        onChange={(event) => setRawYaml(event.target.value)}
        className="h-52 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-100"
        spellCheck={false}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => runImport(rawYaml)}
          className="rounded border border-sky-700 px-3 py-1 text-xs text-sky-300 hover:bg-sky-900/30"
        >
          Validate & Import
        </button>

        <label className="cursor-pointer rounded border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800/50">
          Upload File
          <input
            type="file"
            accept=".persona,.yaml,.yml,text/yaml"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              void onFileChange(file);
            }}
          />
        </label>
      </div>

      {hasErrors ? (
        <ul className="space-y-1 rounded-md border border-rose-900 bg-rose-950/40 px-3 py-2 text-xs text-rose-300">
          {errors.map((error) => (
            <li key={`${error.path}:${error.message}`}>
              <code className="mr-1 text-rose-200">{error.path}</code>
              {error.message}
            </li>
          ))}
        </ul>
      ) : null}

      {preview ? <PersonaPreviewCard preview={preview} /> : null}
    </section>
  );
};
