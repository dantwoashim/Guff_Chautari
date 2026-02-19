import { describe, expect, it } from 'vitest';
import { runPersonaGroupChat } from '../groupChat';
import type { Persona } from '../../../types';

const buildPersona = (overrides: Partial<Persona>): Persona => ({
  id: overrides.id ?? 'persona-1',
  user_id: overrides.user_id ?? 'user-1',
  name: overrides.name ?? 'Persona',
  description: overrides.description ?? 'A practical and concise collaborator.',
  system_instruction: overrides.system_instruction ?? 'Give direct, actionable answers.',
  avatar_url: overrides.avatar_url,
  created_at: overrides.created_at,
  status_text: overrides.status_text,
  is_online: overrides.is_online,
});

describe('group chat', () => {
  it('generates coherent multi-persona responses in one thread', () => {
    const personas: Persona[] = [
      buildPersona({
        id: 'persona-founder',
        name: 'Founder',
        description: 'Thinks in leverage, strategy, and speed.',
      }),
      buildPersona({
        id: 'persona-engineer',
        name: 'Engineer',
        description: 'Focuses on implementation detail and reliability.',
      }),
      buildPersona({
        id: 'persona-operator',
        name: 'Operator',
        description: 'Optimizes process and team execution rhythm.',
      }),
    ];

    const result = runPersonaGroupChat({
      question: 'How should we launch the new onboarding flow next week?',
      personas,
      rounds: 1,
      workspaceId: 'workspace-1',
      createdByUserId: 'owner-1',
      nowIso: '2026-03-01T12:00:00.000Z',
    });

    expect(result.turns).toHaveLength(3);
    expect(new Set(result.turns.map((turn) => turn.personaId))).toEqual(
      new Set(personas.map((persona) => persona.id))
    );
    expect(result.turns.every((turn) => turn.text.toLowerCase().includes('onboarding flow'))).toBe(
      true
    );
    expect(result.coherenceScore).toBeGreaterThan(0);
    expect(result.summary).toContain('onboarding flow');
  });
});

