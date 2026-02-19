import type { PersonaImportPreview as PersonaImportPreviewShape } from '../../engine/persona/personaFormat';

interface PersonaImportPreviewProps {
  preview: PersonaImportPreviewShape;
}

export const PersonaImportPreview = ({ preview }: PersonaImportPreviewProps) => {
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
      <h3 className="mb-1 text-sm font-semibold text-zinc-100">Persona Preview</h3>
      <p className="mb-3 text-xs text-zinc-400">{preview.name}</p>

      <p className="mb-3 text-sm text-zinc-200">{preview.essence}</p>

      <div className="mb-3 grid grid-cols-2 gap-2 text-xs text-zinc-300">
        <span>Tone: {preview.communicationTone}</span>
        <span>Style: {preview.communicationStyle.join(', ')}</span>
        <span>Hard boundaries: {preview.hardBoundaryCount}</span>
        <span>Soft boundaries: {preview.softBoundaryCount}</span>
        <span>Contradictions: {preview.contradictionCount}</span>
      </div>

      <div>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">Top Traits</h4>
        <ul className="space-y-1">
          {preview.topTraits.map((trait) => (
            <li key={trait.name} className="flex items-center justify-between text-xs text-zinc-300">
              <span>{trait.name}</span>
              <span>{trait.weight.toFixed(2)}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};
