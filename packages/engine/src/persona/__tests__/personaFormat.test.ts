import { describe, expect, it } from 'vitest';
import type { Persona } from '../../../../types';
import {
  exportPersonaToYaml,
  importPersonaYaml,
  parsePersonaDocumentYaml,
  personaDocumentToAspects,
} from '../personaFormat';

const validYaml = `version: "1.0"
core:
  name: "Astra"
  essence: "Analytical and warm accountability partner"
  background: "Built for founder operations"
communication:
  tone: "direct and encouraging"
  style:
    - "concise"
    - "structured"
  max_message_length: 720
  emoji_usage: "low"
personality:
  traits:
    - name: "pragmatic"
      weight: 0.85
    - name: "empathetic"
      weight: 0.63
  motivations:
    - "Keep user focused on measurable outcomes"
  boundaries:
    - "Do not fabricate evidence"
behavior:
  response_pacing: "measured"
  conflict_style: "clear and calm"
  affection_style: "supportive"
contradictions:
  - statement_a: "move fast"
    statement_b: "be careful"
    handling: "optimize for reversible decisions"
boundaries:
  hard:
    - "No unsafe instructions"
  soft:
    - "Prefer concise responses"
`;

describe('personaFormat', () => {
  it('imports valid .persona YAML and builds preview/aspects', () => {
    const result = importPersonaYaml(validYaml, {
      userId: 'user-1',
      personaId: 'persona-1',
      createdAtIso: '2026-06-01T10:00:00.000Z',
    });

    expect(result.ok).toBe(true);

    if (!result.ok) return;

    expect(result.persona.name).toBe('Astra');
    expect(result.preview.communicationTone).toBe('direct and encouraging');
    expect(result.preview.topTraits.length).toBeGreaterThan(0);

    const aspects = personaDocumentToAspects(result.document);
    expect(aspects.length).toBeGreaterThanOrEqual(3);
    expect(aspects.some((aspect) => aspect.id === 'boundaries')).toBe(true);
  });

  it('returns schema validation errors for invalid document', () => {
    const invalid = `core:\n  name: "broken"\n`;
    const result = parsePersonaDocumentYaml(invalid);

    expect(result.ok).toBe(false);
    if (result.ok === true) return;

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((entry) => entry.path === '/')).toBe(true);
  });

  it('exports persona to YAML and re-import preserves core persona fields', () => {
    const persona: Persona = {
      id: 'persona-export-1',
      user_id: 'user-2',
      name: 'Export Test',
      description: 'Export persona description',
      system_instruction: 'You are practical and concise. Prefer measurable outcomes.',
      status_text: 'focused',
    };

    const yaml = exportPersonaToYaml(persona);
    const imported = importPersonaYaml(yaml, {
      userId: 'user-2',
      personaId: 'persona-export-1',
    });

    expect(imported.ok).toBe(true);
    if (!imported.ok) return;

    expect(imported.persona.id).toBe('persona-export-1');
    expect(imported.persona.name).toBe(persona.name);
    expect(imported.persona.description).toBe(persona.description);
    expect(imported.persona.system_instruction).toBe(persona.system_instruction);
  });
});
