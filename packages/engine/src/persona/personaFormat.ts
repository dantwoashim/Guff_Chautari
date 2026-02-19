import Ajv from 'ajv';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { Persona } from '../../../types';
import type { PersonaAspect } from '../pipeline/types';

export type PersonaEmojiUsage = 'low' | 'medium' | 'high';
export type PersonaResponsePacing = 'instant' | 'measured' | 'slow';

export interface PersonaTrait {
  name: string;
  weight: number;
}

export interface PersonaContradiction {
  statement_a: string;
  statement_b: string;
  handling: string;
}

export interface PersonaBoundarySet {
  hard: string[];
  soft: string[];
}

export interface PersonaCoreSpec {
  name: string;
  essence: string;
  background?: string;
  relationship?: string;
  age_range?: string;
}

export interface PersonaCommunicationSpec {
  tone: string;
  style: string[];
  max_message_length: number;
  emoji_usage: PersonaEmojiUsage;
}

export interface PersonaBehaviorSpec {
  response_pacing: PersonaResponsePacing;
  conflict_style: string;
  affection_style: string;
  humor_style?: string;
}

export interface PersonaDocumentV1 {
  version: '1.0';
  core: PersonaCoreSpec;
  communication: PersonaCommunicationSpec;
  personality: {
    traits: PersonaTrait[];
    motivations: string[];
    boundaries: string[];
  };
  behavior: PersonaBehaviorSpec;
  contradictions: PersonaContradiction[];
  boundaries: PersonaBoundarySet;
  metadata?: Record<string, string>;
}

export interface PersonaFormatError {
  path: string;
  message: string;
}

export interface PersonaImportPreview {
  name: string;
  essence: string;
  communicationTone: string;
  communicationStyle: string[];
  topTraits: PersonaTrait[];
  hardBoundaryCount: number;
  softBoundaryCount: number;
  contradictionCount: number;
}

export interface PersonaImportOptions {
  userId: string;
  personaId?: string;
  createdAtIso?: string;
}

export type PersonaImportResult =
  | {
      ok: true;
      document: PersonaDocumentV1;
      persona: Persona;
      preview: PersonaImportPreview;
    }
  | {
      ok: false;
      errors: PersonaFormatError[];
    };

export const personaDocumentV1Schema = {
  $id: 'https://ashim.dev/schemas/persona-v1.json',
  type: 'object',
  additionalProperties: false,
  required: [
    'version',
    'core',
    'communication',
    'personality',
    'behavior',
    'contradictions',
    'boundaries',
  ],
  properties: {
    version: { type: 'string', const: '1.0' },
    core: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'essence'],
      properties: {
        name: { type: 'string', minLength: 1 },
        essence: { type: 'string', minLength: 1 },
        background: { type: 'string' },
        relationship: { type: 'string' },
        age_range: { type: 'string' },
      },
    },
    communication: {
      type: 'object',
      additionalProperties: false,
      required: ['tone', 'style', 'max_message_length', 'emoji_usage'],
      properties: {
        tone: { type: 'string', minLength: 1 },
        style: {
          type: 'array',
          minItems: 1,
          items: { type: 'string', minLength: 1 },
        },
        max_message_length: { type: 'number', minimum: 20, maximum: 4000 },
        emoji_usage: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
        },
      },
    },
    personality: {
      type: 'object',
      additionalProperties: false,
      required: ['traits', 'motivations', 'boundaries'],
      properties: {
        traits: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['name', 'weight'],
            properties: {
              name: { type: 'string', minLength: 1 },
              weight: { type: 'number', minimum: 0, maximum: 1 },
            },
          },
        },
        motivations: {
          type: 'array',
          items: { type: 'string', minLength: 1 },
        },
        boundaries: {
          type: 'array',
          items: { type: 'string', minLength: 1 },
        },
      },
    },
    behavior: {
      type: 'object',
      additionalProperties: false,
      required: ['response_pacing', 'conflict_style', 'affection_style'],
      properties: {
        response_pacing: { type: 'string', enum: ['instant', 'measured', 'slow'] },
        conflict_style: { type: 'string', minLength: 1 },
        affection_style: { type: 'string', minLength: 1 },
        humor_style: { type: 'string' },
      },
    },
    contradictions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['statement_a', 'statement_b', 'handling'],
        properties: {
          statement_a: { type: 'string', minLength: 1 },
          statement_b: { type: 'string', minLength: 1 },
          handling: { type: 'string', minLength: 1 },
        },
      },
    },
    boundaries: {
      type: 'object',
      additionalProperties: false,
      required: ['hard', 'soft'],
      properties: {
        hard: {
          type: 'array',
          items: { type: 'string', minLength: 1 },
        },
        soft: {
          type: 'array',
          items: { type: 'string', minLength: 1 },
        },
      },
    },
    metadata: {
      type: 'object',
      additionalProperties: { type: 'string' },
    },
  },
} as const;

const ajv = new Ajv({ allErrors: true, strict: false });
const validatePersonaDocument = ajv.compile(personaDocumentV1Schema);

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

const toTokenEstimate = (value: string): number => {
  const words = value
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0).length;
  return Math.ceil(words / 0.75);
};

const defaultPersonaId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `persona-${Math.random().toString(16).slice(2, 10)}`;
};

const toErrors = (rawErrors: ReadonlyArray<{ instancePath?: string; message?: string }>): PersonaFormatError[] => {
  return rawErrors.map((entry) => ({
    path: entry.instancePath && entry.instancePath.length > 0 ? entry.instancePath : '/',
    message: entry.message ?? 'invalid value',
  }));
};

const composeSystemInstruction = (document: PersonaDocumentV1): string => {
  const sections: string[] = [];

  sections.push(`Name: ${document.core.name}`);
  sections.push(`Essence: ${document.core.essence}`);

  if (document.core.background) {
    sections.push(`Background: ${document.core.background}`);
  }

  if (document.core.relationship) {
    sections.push(`Relationship framing: ${document.core.relationship}`);
  }

  if (document.core.age_range) {
    sections.push(`Age range: ${document.core.age_range}`);
  }

  sections.push(
    `Communication: tone=${document.communication.tone}; style=${document.communication.style.join(', ')}; max_length=${document.communication.max_message_length}; emoji_usage=${document.communication.emoji_usage}`
  );

  if (document.personality.traits.length > 0) {
    const traits = document.personality.traits
      .map((trait) => `${trait.name}(${trait.weight.toFixed(2)})`)
      .join(', ');
    sections.push(`Personality traits: ${traits}`);
  }

  if (document.personality.motivations.length > 0) {
    sections.push(`Motivations: ${document.personality.motivations.join('; ')}`);
  }

  if (document.personality.boundaries.length > 0) {
    sections.push(`Personality boundaries: ${document.personality.boundaries.join('; ')}`);
  }

  sections.push(
    `Behavior: pacing=${document.behavior.response_pacing}; conflict=${document.behavior.conflict_style}; affection=${document.behavior.affection_style}${document.behavior.humor_style ? `; humor=${document.behavior.humor_style}` : ''}`
  );

  if (document.boundaries.hard.length > 0) {
    sections.push(`Hard boundaries: ${document.boundaries.hard.join('; ')}`);
  }

  if (document.boundaries.soft.length > 0) {
    sections.push(`Soft boundaries: ${document.boundaries.soft.join('; ')}`);
  }

  if (document.contradictions.length > 0) {
    const lines = document.contradictions.map(
      (entry) => `${entry.statement_a} <> ${entry.statement_b} => ${entry.handling}`
    );
    sections.push(`Contradictions: ${lines.join(' | ')}`);
  }

  return sections.join('\n');
};

export const parsePersonaDocumentYaml = (content: string): PersonaImportResult => {
  try {
    const parsed = parseYaml(content) as unknown;

    const valid = validatePersonaDocument(parsed);
    if (!valid) {
      return {
        ok: false,
        errors: toErrors(
          (validatePersonaDocument.errors ?? []).map((error) => ({
            instancePath: error.instancePath,
            message: error.message,
          }))
        ),
      };
    }

    const document = parsed as PersonaDocumentV1;

    return {
      ok: true,
      document,
      persona: {
        id: defaultPersonaId(),
        user_id: 'unknown',
        name: document.core.name,
        description: document.core.essence,
        system_instruction: composeSystemInstruction(document),
      },
      preview: buildPersonaImportPreview(document),
    };
  } catch (error) {
    return {
      ok: false,
      errors: [
        {
          path: '/',
          message: error instanceof Error ? error.message : 'YAML parse error',
        },
      ],
    };
  }
};

export const buildPersonaImportPreview = (document: PersonaDocumentV1): PersonaImportPreview => {
  const topTraits = document.personality.traits
    .slice()
    .sort((left, right) => right.weight - left.weight)
    .slice(0, 4);

  return {
    name: document.core.name,
    essence: document.core.essence,
    communicationTone: document.communication.tone,
    communicationStyle: [...document.communication.style],
    topTraits,
    hardBoundaryCount: document.boundaries.hard.length,
    softBoundaryCount: document.boundaries.soft.length,
    contradictionCount: document.contradictions.length,
  };
};

export const documentToPersona = (
  document: PersonaDocumentV1,
  options: PersonaImportOptions
): Persona => {
  const fallbackSystemInstruction = composeSystemInstruction(document);
  const systemInstruction = document.metadata?.original_system_instruction ?? fallbackSystemInstruction;

  return {
    id: options.personaId ?? defaultPersonaId(),
    user_id: options.userId,
    name: document.core.name,
    description: document.core.essence,
    system_instruction: systemInstruction,
    status_text: document.communication.tone,
    is_online: true,
    created_at: options.createdAtIso,
  };
};

export const personaToDocument = (
  persona: Persona,
  template: Partial<PersonaDocumentV1> = {}
): PersonaDocumentV1 => {
  const baseDocument: PersonaDocumentV1 = {
    version: '1.0',
    core: {
      name: persona.name,
      essence: persona.description || persona.system_instruction.slice(0, 160),
      background: template.core?.background,
      relationship: template.core?.relationship,
      age_range: template.core?.age_range,
    },
    communication: {
      tone: template.communication?.tone ?? persona.status_text ?? 'practical and warm',
      style: template.communication?.style ?? ['concise', 'grounded', 'honest'],
      max_message_length: clamp(template.communication?.max_message_length ?? 700, 20, 4000),
      emoji_usage: template.communication?.emoji_usage ?? 'low',
    },
    personality: {
      traits:
        template.personality?.traits ?? [
          { name: 'pragmatic', weight: 0.82 },
          { name: 'empathetic', weight: 0.62 },
          { name: 'direct', weight: 0.74 },
        ],
      motivations:
        template.personality?.motivations ?? [
          'Help user make practical progress',
          'Maintain emotional coherence',
        ],
      boundaries:
        template.personality?.boundaries ?? [
          'No fabricated claims presented as facts',
          'Respect user explicit constraints',
        ],
    },
    behavior: {
      response_pacing: template.behavior?.response_pacing ?? 'measured',
      conflict_style: template.behavior?.conflict_style ?? 'address directly with calm tone',
      affection_style: template.behavior?.affection_style ?? 'supportive without dependency language',
      humor_style: template.behavior?.humor_style,
    },
    contradictions: template.contradictions ?? [],
    boundaries: template.boundaries ?? {
      hard: ['Do not provide unsafe or illegal guidance'],
      soft: ['Prefer concise responses unless detail is requested'],
    },
    metadata: {
      ...(template.metadata ?? {}),
      original_system_instruction: persona.system_instruction,
      source_persona_id: persona.id,
      system_instruction_token_estimate: String(toTokenEstimate(persona.system_instruction)),
    },
  };

  const valid = validatePersonaDocument(baseDocument);
  if (!valid) {
    const messages = toErrors(
      (validatePersonaDocument.errors ?? []).map((error) => ({
        instancePath: error.instancePath,
        message: error.message,
      }))
    )
      .map((entry) => `${entry.path} ${entry.message}`)
      .join('; ');
    throw new Error(`Cannot export persona, invalid document: ${messages}`);
  }

  return baseDocument;
};

export const exportPersonaDocumentToYaml = (document: PersonaDocumentV1): string => {
  return stringifyYaml(document, {
    indent: 2,
    lineWidth: 100,
    minContentWidth: 20,
  });
};

export const exportPersonaToYaml = (
  persona: Persona,
  template: Partial<PersonaDocumentV1> = {}
): string => {
  const document = personaToDocument(persona, template);
  return exportPersonaDocumentToYaml(document);
};

export const importPersonaYaml = (
  content: string,
  options: PersonaImportOptions
): PersonaImportResult => {
  const parsed = parsePersonaDocumentYaml(content);
  if (!parsed.ok) {
    return parsed;
  }

  const persona = documentToPersona(parsed.document, options);

  return {
    ok: true,
    document: parsed.document,
    persona,
    preview: parsed.preview,
  };
};

const aspectFromSection = (id: string, title: string, content: string, keywords: string[]): PersonaAspect => {
  return {
    id,
    title,
    content,
    keywords,
    estimatedTokens: toTokenEstimate(content),
  };
};

export const personaDocumentToAspects = (document: PersonaDocumentV1): PersonaAspect[] => {
  const aspects: PersonaAspect[] = [];

  aspects.push(
    aspectFromSection(
      'core',
      'Core Essence',
      `${document.core.essence}${document.core.background ? ` Background: ${document.core.background}` : ''}`,
      ['essence', 'identity', 'core']
    )
  );

  aspects.push(
    aspectFromSection(
      'communication',
      'Communication Style',
      `Tone: ${document.communication.tone}. Style: ${document.communication.style.join(', ')}. Emoji usage: ${document.communication.emoji_usage}.`,
      ['communication', 'tone', 'style']
    )
  );

  if (document.personality.traits.length > 0) {
    aspects.push(
      aspectFromSection(
        'personality',
        'Personality Traits',
        document.personality.traits
          .map((trait) => `${trait.name}(${trait.weight.toFixed(2)})`)
          .join(', '),
        ['personality', 'traits', 'motivations']
      )
    );
  }

  if (document.boundaries.hard.length > 0 || document.boundaries.soft.length > 0) {
    aspects.push(
      aspectFromSection(
        'boundaries',
        'Boundaries',
        `Hard: ${document.boundaries.hard.join('; ')}. Soft: ${document.boundaries.soft.join('; ')}`,
        ['boundaries', 'safety', 'limits']
      )
    );
  }

  return aspects;
};
